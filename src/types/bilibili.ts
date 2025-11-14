/**
 * Shared Type Definitions for Bilibili proxy controllers
 * Extracted from controllers and helpers so they can be imported centrally.
 */

/** Generic API response wrapper returned by Bilibili API */
export interface BaseResponse<T> {
  code: number;
  message: string;
  ttl: number;
  data: T;
}

/** WBI keys response shape */
export interface WbiKeysResponse {
  img_key: string;
  sub_key: string;
}

/** Partial shape of the "nav" API response needed for WBI keys */
export interface NavData {
  wbi_img: {
    img_url: string;
    sub_url: string;
  };
}

/** Minimal video view data used to obtain cid */
export interface VideoViewData {
  cid: number;
  pages: Array<{
    cid: number;
    page: number;
    part: string;
  }>;
}

/** Representation of a DASH stream (video or audio) */
export interface DashStream {
  id: number;
  base_url: string;
  backup_url: string[];
  bandwidth?: number;
  mime_type?: string;
  codecs?: string;
  width?: number;
  height?: number;
  frame_rate?: string;
  sar?: string;
  segment_base: {
    index_range: string;
    initialization: string;
  };
  start_with_sap?: number;
  size: number;
  audioSamplingRate?: number;
}

/** Aggregated DASH metadata returned by Bilibili play API */
export interface DashData {
  duration: number;
  timelength: number;
  minBufferTime: number;
  video: DashStream[];
  audio: DashStream[];
  supportFormats: VideoFormate[];
}
export interface VideoFormate {
  quality: number;
  format: string;
  new_description: string;
  display_desc: string;
}



export interface XmlListItem {
  xml: string;
  id: number;
  format?: string;
  quality?: number;
  display_desc?: string;
  new_description?: string;
  base_url?: string;
  backup_url?: string[];
  bandwidth?: number;
  mime_type?: string;
  codecs?: string;
  width?: number;
  height?: number;
  frame_rate?: string;
  sar?: string;
  segment_base?: {
    index_range: string;
    initialization: string;
  };
  start_with_sap?: number;
  size?: number;
  audioSamplingRate?: number;
}


/** The full-ish playurl response data we expect from the API */
export interface PlayVideoData {
  timelength?: number;
  dash?: {
    timelength?: number;
    duration?: number;
    minBufferTime?: number;
    video?: DashStream[];
    audio?: DashStream[];
  };
  accept_quality?: number[];
  support_formats?: VideoFormate[];
  data?: {
    timelength?: number;
    accept_quality?: number[];
    support_formats?: VideoFormate[];
    dash?: {
      duration?: number;
      minBufferTime?: number;
      timelength?: number;
      video?: DashStream[];
      audio?: DashStream[];
    };
  };
  durl?: { url: string; size: number }[];
}

/** Parameters used to produce a WBI signature */
export type EncWbiParams = Record<string, string | number | boolean>;

/** Result of encWbi signing operation */
export interface EncWbiResult {
  wts: number;
  w_rid: string;
}

/* -------------------- ofetch wrapper related types -------------------- */

/** A minimal request options shape for our ofetch wrapper (only fields we use) */
export interface OfetchRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  responseType?: 'json' | 'text' | 'stream' | 'blob';
  timeout?: number;
}

/** Minimal headers-like interface we expect from ofetch.raw() */
export interface OfetchHeaders {
  get(name: string): string | null;
  entries(): IterableIterator<[string, string]>;
}

/** The shape we narrow the raw ofetch response to when requesting streams */
export interface OfetchRawResponse {
  status: number;
  headers: OfetchHeaders;
  body: ReadableStream<Uint8Array> | null;
}

/**
 * 如果你想为具体接口定义一个返回 DTO，可以在这里定义并导出
 * 例如你在 getVideoManifest 中返回 { xml, pages }
 */
export interface VideoManifestResponse {
  xml: string;
  pages: Array<{
    cid: number;
    page: number;
    part: string;
  }>;
}
