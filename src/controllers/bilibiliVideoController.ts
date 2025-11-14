import { Get, Query, Route, Request, Tags } from 'tsoa';
import { Request as ExpressRequest } from 'express'; // 引入 Express 类型
import md5 from 'md5';
import { create } from 'xmlbuilder2';
import { BaseController } from './baseController';
import { ApiResponse } from '../types/express';
import { ofetchJson } from '../utils/ofetch';
import { BaseResponse, EncWbiParams, EncWbiResult, DashData, NavData, PlayVideoData, VideoViewData, WbiKeysResponse, VideoManifestResponse, XmlListItem } from '../types/bilibili';


/**
 * mixinKey table (unchanged)
 */
const mixinKeyEncTab: number[] = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

/**
 * safer mixin key generator: 使用 charAt 避免索引越界导致 undefined 字符串
 */
const getMixinKey = (orig: string): string =>
  mixinKeyEncTab.map((n) => orig.charAt(n)).join('').slice(0, 32);

/**
 * WBI 签名
 */
function encWbi(params: EncWbiParams, img_key: string, sub_key: string): EncWbiResult {
  const mixin_key = getMixinKey(img_key + sub_key);
  const curr_time = Math.floor(Date.now() / 1000);
  const chr_filter = /[!\(\)'\*]/g;

  // 确保 params 里包含 wts
  Object.assign(params, { wts: curr_time });

  const query = Object.keys(params)
    .sort()
    .map((key) => {
      const value = String(params[key]).replace(chr_filter, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');

  const wbi_sign = md5(query + mixin_key);
  return { wts: curr_time, w_rid: wbi_sign };
}

/**
 * 获取 WBI keys（更稳健）
 */
async function getWbiKeys(sessdata?: string): Promise<WbiKeysResponse> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    Referer: 'https://www.bilibili.com',
  };
  if (sessdata) headers.Cookie = `SESSDATA=${sessdata};`;

  const res = await ofetchJson<BaseResponse<NavData>>('https://api.bilibili.com/x/web-interface/nav', {
    method: 'GET',
    headers,
    timeout: 5000,
  });

  if (!res?.data?.wbi_img) {
    throw new Error('Unable to obtain WBI keys: missing wbi_img in nav response');
  }

  const img_url = res.data.wbi_img.img_url || '';
  const sub_url = res.data.wbi_img.sub_url || '';

  const img_key = img_url.split('/').pop()?.split('.')[0] ?? '';
  const sub_key = sub_url.split('/').pop()?.split('.')[0] ?? '';

  if (!img_key || !sub_key) {
    throw new Error('Invalid WBI keys returned by nav API');
  }

  return { img_key, sub_key };
}

/**
 * Helper to avoid double-encoding query value.
 * If url appears already encoded (decodeURIComponent(url) !== url) we keep it.
 * Otherwise we encode it so it's safe as a query parameter value.
 */
function encodeUrlForQuery(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    if (decoded !== url) {
      // Seems already encoded — return as-is
      return url;
    }
  } catch (e) {
    // decodeURIComponent may throw; ignore and encode below
  }
  return encodeURIComponent(url);
}

/**
 * 将远端 stream/url 包装为代理访问 URL（使 MPD 指向本服务的 /stream endpoint）
 */
function replaceProxyUrl(url: string, baseUrl: string, bvid: string): string {  // Add bvid parameter
  const encodedUrl = encodeUrlForQuery(url);
  const encodedBvid = encodeURIComponent(bvid);
  return `${baseUrl.replace(/\/$/, '')}/proxy/bilibili/stream?url=${encodedUrl}&bvid=${encodedBvid}`;
}

// helper: 清洗 codec / mime 字段 (去掉引号和反斜线等)
function sanitizeCodec(val?: string): string | undefined {
  if (!val) return undefined;
  return val.replace(/["'\\]/g, '').trim() || undefined;
}

function sanitizeMime(val?: string): string | undefined {
  if (!val) return undefined;
  return val.replace(/["'\\]/g, '').trim() || undefined;
}


/**
 * Generate MPD (DASH manifest) - using sanitized codec/mime and safe url encoding
 */
function generateMPD(dashData: DashData, baseUrl: string, bvid:string, videoIndex?: number): string {
  const duration = dashData.duration || Math.floor((dashData.timelength || 0) / 1000);
  const minBufferTime = dashData.minBufferTime || 1;
  
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('MPD', {
    xmlns: 'urn:mpeg:dash:schema:mpd:2011',
    type: 'static',
    mediaPresentationDuration: `PT${duration}S`,
    minBufferTime: `PT${minBufferTime}S`,
    profiles: 'urn:mpeg:dash:profile:isoff-on-demand:2011',
  });

  const period = root.ele('Period', { duration: `PT${duration}S` });

  // Video AdaptationSet
  const videoAdaptationSet = period.ele('AdaptationSet', {
    segmentAlignment: 'true',
    subsegmentAlignment: 'true',
    subsegmentStartsWithSAP: '1',
  });

  let videoStreams = dashData.video || [];

  // use sanitized codec when checking preferred
  let preferredVideo = null;
  if(typeof videoIndex === "number" && videoIndex >= 0) {
    preferredVideo = videoStreams[videoIndex];
  }else {
    preferredVideo = videoStreams.find((v) => sanitizeCodec(v.codecs)?.startsWith('avc1.64'));
  }
  // const preferredVideoList = videoStreams.filter((v) => sanitizeCodec(v.codecs) === 'avc1.64');
  if (preferredVideo) videoStreams = [preferredVideo];

  videoStreams.forEach((video) => {
    const attributes: Record<string, string> = {
      id: String(video.id),
    };
    const cleanMime = sanitizeMime(video.mime_type);
    const cleanCodec = sanitizeCodec(video.codecs);
    if (cleanMime) attributes.mimeType = cleanMime;
    if (cleanCodec) attributes.codecs = cleanCodec;
    if (video.width) attributes.width = String(video.width);
    if (video.height) attributes.height = String(video.height);
    if (video.frame_rate) attributes.frameRate = String(video.frame_rate);
    if (video.sar) attributes.sar = String(video.sar);
    if (video.start_with_sap !== undefined) attributes.startWithSAP = String(video.start_with_sap);
    if (video.bandwidth !== undefined) attributes.bandwidth = String(video.bandwidth);

    const rep = videoAdaptationSet.ele('Representation', attributes);
    rep.ele('BaseURL').txt(replaceProxyUrl(video.base_url, baseUrl, bvid));
    if (video.backup_url && video.backup_url.length > 0) {
      video.backup_url.forEach((u) =>
        rep.ele('BaseURL', { serviceLocation: 'backup' }).txt(replaceProxyUrl(u, baseUrl, bvid))
      );
    }
    rep
      .ele('SegmentBase', { indexRange: video.segment_base.index_range })
      .ele('Initialization', { range: video.segment_base.initialization });
  });

  // Audio AdaptationSet
  const audioAdaptationSet = period.ele('AdaptationSet', {
    segmentAlignment: 'true',
    subsegmentAlignment: 'true',
    subsegmentStartsWithSAP: '1',
  });

  let audioStreams = dashData.audio || [];
  const preferredAudio = audioStreams.find((a) => sanitizeCodec(a.codecs) === 'mp4a.40.2');
  if (preferredAudio) audioStreams = [preferredAudio];

  audioStreams.forEach((audio) => {
    const attributes: Record<string, string> = {
      id: String(audio.id),
    };
    const cleanMime = sanitizeMime(audio.mime_type);
    const cleanCodec = sanitizeCodec(audio.codecs);
    if (cleanMime) attributes.mimeType = cleanMime;
    if (cleanCodec) attributes.codecs = cleanCodec;
    if (audio.start_with_sap !== undefined) attributes.startWithSAP = String(audio.start_with_sap);
    if (audio.bandwidth !== undefined) attributes.bandwidth = String(audio.bandwidth);
    if (audio.audioSamplingRate !== undefined) attributes['audioSamplingRate'] = String(audio.audioSamplingRate);

    const rep = audioAdaptationSet.ele('Representation', attributes);
    rep.ele('AudioChannelConfiguration', {
      schemeIdUri: 'urn:mpeg:dash:23003:3:audio_channel_configuration:2011',
      value: '2',
    });
    rep.ele('BaseURL').txt(replaceProxyUrl(audio.base_url, baseUrl, bvid));
    if (audio.backup_url && audio.backup_url.length > 0) {
      audio.backup_url.forEach((u) =>
        rep.ele('BaseURL', { serviceLocation: 'backup' }).txt(replaceProxyUrl(u, baseUrl, bvid))
      );
    }
    rep
      .ele('SegmentBase', { indexRange: audio.segment_base.index_range })
      .ele('Initialization', { range: audio.segment_base.initialization });
  });

  return root.end({ prettyPrint: true });
}
function generateFormatList(dashData: DashData): XmlListItem[] {
  const videoStreams = dashData.video || [];
  const formatList: XmlListItem[] = [];
  dashData.supportFormats.forEach(v => { 
    formatList.push({
      id: v.quality,
      format: v.format,
      new_description: v.new_description,
      display_desc: v.display_desc,
      xml:""

    })
  });

  videoStreams.forEach((v) => { 
    if(sanitizeCodec(v.codecs)?.startsWith('avc1.64')) {
      let findItem = formatList.find(mpdI => mpdI.id === v.id);
      if(findItem) {
        findItem = Object.assign(findItem, v);
      }else {
        formatList.push({
          ...v,
          xml:""
        })

      }
    }
  });

  return formatList;
}

/**
 * 生成包含所有清晰度的统一 MPD
 */
function generateUnifiedMPD(dashData: DashData, baseUrl: string, bvid: string): string {
  const duration = dashData.duration || Math.floor((dashData.timelength || 0) / 1000);
  const minBufferTime = dashData.minBufferTime || 1;
  
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('MPD', {
    xmlns: 'urn:mpeg:dash:schema:mpd:2011',
    type: 'static',
    mediaPresentationDuration: `PT${duration}S`,
    minBufferTime: `PT${minBufferTime}S`,
    profiles: 'urn:mpeg:dash:profile:isoff-on-demand:2011',
  });

  const period = root.ele('Period', { duration: `PT${duration}S` });

  // Video AdaptationSet - 包含所有 avc1.64 编码的视频流
  const videoAdaptationSet = period.ele('AdaptationSet', {
    segmentAlignment: 'true',
    subsegmentAlignment: 'true',
    subsegmentStartsWithSAP: '1',
  });

  // 筛选所有 avc1.64 编码的视频流
  const videoStreams = (dashData.video || []).filter((v) => 
    sanitizeCodec(v.codecs)?.startsWith('avc1.64')
  );

  videoStreams.forEach((video) => {
    const attributes: Record<string, string> = {
      id: String(video.id),
    };
    const cleanMime = sanitizeMime(video.mime_type);
    const cleanCodec = sanitizeCodec(video.codecs);
    if (cleanMime) attributes.mimeType = cleanMime;
    if (cleanCodec) attributes.codecs = cleanCodec;
    if (video.width) attributes.width = String(video.width);
    if (video.height) attributes.height = String(video.height);
    if (video.frame_rate) attributes.frameRate = String(video.frame_rate);
    if (video.sar) attributes.sar = String(video.sar);
    if (video.start_with_sap !== undefined) attributes.startWithSAP = String(video.start_with_sap);
    if (video.bandwidth !== undefined) attributes.bandwidth = String(video.bandwidth);

    const rep = videoAdaptationSet.ele('Representation', attributes);
    rep.ele('BaseURL').txt(replaceProxyUrl(video.base_url, baseUrl, bvid));
    if (video.backup_url && video.backup_url.length > 0) {
      video.backup_url.forEach((u) =>
        rep.ele('BaseURL', { serviceLocation: 'backup' }).txt(replaceProxyUrl(u, baseUrl, bvid))
      );
    }
    rep
      .ele('SegmentBase', { indexRange: video.segment_base.index_range })
      .ele('Initialization', { range: video.segment_base.initialization });
  });

  // Audio AdaptationSet
  const audioAdaptationSet = period.ele('AdaptationSet', {
    segmentAlignment: 'true',
    subsegmentAlignment: 'true',
    subsegmentStartsWithSAP: '1',
  });

  let audioStreams = dashData.audio || [];
  const preferredAudio = audioStreams.find((a) => sanitizeCodec(a.codecs) === 'mp4a.40.2');
  if (preferredAudio) audioStreams = [preferredAudio];

  audioStreams.forEach((audio) => {
    const attributes: Record<string, string> = {
      id: String(audio.id),
    };
    const cleanMime = sanitizeMime(audio.mime_type);
    const cleanCodec = sanitizeCodec(audio.codecs);
    if (cleanMime) attributes.mimeType = cleanMime;
    if (cleanCodec) attributes.codecs = cleanCodec;
    if (audio.start_with_sap !== undefined) attributes.startWithSAP = String(audio.start_with_sap);
    if (audio.bandwidth !== undefined) attributes.bandwidth = String(audio.bandwidth);
    if (audio.audioSamplingRate !== undefined) attributes['audioSamplingRate'] = String(audio.audioSamplingRate);

    const rep = audioAdaptationSet.ele('Representation', attributes);
    rep.ele('AudioChannelConfiguration', {
      schemeIdUri: 'urn:mpeg:dash:23003:3:audio_channel_configuration:2011',
      value: '2',
    });
    rep.ele('BaseURL').txt(replaceProxyUrl(audio.base_url, baseUrl, bvid));
    if (audio.backup_url && audio.backup_url.length > 0) {
      audio.backup_url.forEach((u) =>
        rep.ele('BaseURL', { serviceLocation: 'backup' }).txt(replaceProxyUrl(u, baseUrl, bvid))
      );
    }
    rep
      .ele('SegmentBase', { indexRange: audio.segment_base.index_range })
      .ele('Initialization', { range: audio.segment_base.initialization });
  });

  return root.end({ prettyPrint: true });
}



/**
 * 获取 DASH 信息（包含 WBI 签名）
 */
async function getDashInfo(bvid: string, sessdata?: string, cid?: number): Promise<{ dash: DashData, pages: VideoViewData['pages'] }> {
  if (!bvid || !bvid.trim()) {
    throw new Error('bvid is required');
  }

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    Referer: 'https://www.bilibili.com',
    Cookie: sessdata ? `SESSDATA=${sessdata}` : '',
  };

  let paramsCid = cid;

  // 获取 cid
  const viewRes = await ofetchJson<BaseResponse<VideoViewData>>(
    `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
    { method: 'GET', headers, timeout: 5000 }
  );
  if (!cid) {


    paramsCid = viewRes?.data?.cid;
    if (!paramsCid) throw new Error('Failed to fetch video cid');

  }

  const { img_key, sub_key } = await getWbiKeys(sessdata);

  let params: EncWbiParams = {
    bvid,
    cid: paramsCid as number,
    fnval: 80, // 请求 DASH
    fnver: 0,
    fourk: 1,
  };

  const sign = encWbi(params, img_key, sub_key);
  params = { ...params, ...sign };

  const playRes = await ofetchJson<BaseResponse<PlayVideoData>>('https://api.bilibili.com/x/player/wbi/playurl', {
    method: 'GET',
    headers,
    query: params,
    timeout: 5000,
  });
  


  const supportFormats = playRes?.data?.support_formats ?? playRes?.data?.data?.support_formats;
  const dash = playRes?.data?.dash ?? playRes?.data?.data?.dash;
  if (!dash || !dash.video || dash.video.length === 0 || !dash.audio || dash.audio.length === 0) {
    throw new Error('Unable to obtain DASH playurl (no audio/video streams)');
  }

  const videoStreams = (dash.video || []).slice().sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
  const audioStreams = (dash.audio || []).slice().sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
  const timelength = dash.timelength ?? (playRes.data?.timelength ?? 0);

  return {
    pages: viewRes.data.pages,
    dash: {
      ...dash,
      video: videoStreams,
      audio: audioStreams,
      supportFormats,
      duration: dash.duration ?? Math.floor((timelength || 0) / 1000),
      minBufferTime: dash.minBufferTime ?? 1,
      timelength,
    } as DashData,
  };
}

/**
 * Controller
 */
@Tags('B站视频代理')
@Route('proxy/bilibili')
export class BilibiliVideoController extends BaseController {
  /**
   * 生成DASH格式视频清单(MPD)
   *
   * @param bvid Bilibili BV id
   * @param cid 通过cid获取不同的分p视频
   * @param req Request object
   * @param res Response object
   */
  @Get('video-manifest')
  public async getVideoManifest(
    @Request() req: ExpressRequest,
    @Query() bvid: string,
    @Query() cid?: number,
  ): Promise<ApiResponse<VideoManifestResponse>> {
    try {
      if (!bvid || !bvid.trim()) {
        return this.fail("bvid parameter is required", null, 400)
      }

      const protocol = req.protocol || 'http';
      const host = req.get('host') || process.env.HOST || 'localhost:3000';
      let baseUrl = `${protocol}://${host}`;

      // adjust common port cases
      if (protocol === 'http' && host.includes(':443')) {
        baseUrl = `https://${host.split(':')[0]}`;
      } else if (protocol === 'http' && host.includes(':80')) {
        baseUrl = `http://${host.split(':')[0]}`;
      }
      function getCookieValue(cookieString: string, cookieName: string): string {
        if (!cookieString) {
          return "";
        }
        const cookies = cookieString.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === cookieName) {
            return value;
          }
        }
        return "";
      }


      // 获取 cookie 中的 SESSDATA
      const cookieHeader = typeof req?.headers?.cookie === 'string' ? req.headers.cookie : '';
      const sessionDataCookie = getCookieValue(cookieHeader, 'SESSDATA');

      const dashInfo = await getDashInfo(bvid, sessionDataCookie, cid);
      const mpdXML = generateMPD(dashInfo.dash, baseUrl + "/api", bvid);
      const formatList = generateFormatList(dashInfo.dash)
      const unifiedMpd = generateUnifiedMPD(dashInfo.dash, baseUrl + "/api", bvid)


      return this.ok({
        xml: mpdXML,
        formatList,
        unifiedMpd,
        pages: dashInfo.pages,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[BilibiliVideoController.getVideoManifest] error:', msg);
      return this.fail(msg)
    }
  }
}
