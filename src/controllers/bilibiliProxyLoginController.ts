import { Get, Route, Tags, Post, Body } from 'tsoa';

import { BaseController } from './baseController';
import { ApiResponse } from '../types/express';
import { ofetch } from 'ofetch';

// 定义短信请求参数类型
interface SmsRequestParams {
  cid: number;
  tel: string;
  source: 'main_web' | 'main_mini' | 'main-fe-header';
  token: string;
  challenge: string;
  validate: string;
  seccode: string;
}

// 定义登录请求参数类型
interface LoginRequestParams {
  cid: number;
  tel: string;
  code: string;
  source: string;
  captcha_key: string;
  go_url: string;
  keep: boolean;
}

@Tags('B站视频代理')
@Route('proxy/bilibili')
export class BilibiliProxyLoginController extends BaseController {

  @Get('captcha')
  public async proxyBilibiliCaptcha(): Promise<ApiResponse | void> {
    const urlString = "https://passport.bilibili.com/x/passport-login/captcha?source=main_web";

    try {
      const res = await ofetch(urlString);
      return this.ok(res, "获取验证码成功");
    } catch (error) {
      return this.fail("获取验证码失败");
    }
  }

  @Post("sms")
  public async proxyBilibiliSms(
    @Body() params: SmsRequestParams
  ): Promise<ApiResponse> {
    const urlString = "https://passport.bilibili.com/x/passport-login/web/sms/send";

    try {
      // 构造 x-www-form-urlencoded 格式请求
      const body = new URLSearchParams();
      body.append('source', params.source);
      body.append('tel', params.tel);
      body.append('cid', params.cid.toString());
      body.append('validate', params.validate);
      body.append('token', params.token);
      body.append('seccode', params.seccode);
      body.append('challenge', params.challenge);
// headers['Host'] = hostHeader;
      const res = await ofetch(urlString, ({
        method: "POST",
        headers: {
          'accept': '*/*',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          'content-type': 'application/x-www-form-urlencoded',
          'origin': 'https://www.bilibili.com',
          "Host": "passport.bilibili.com",
          'priority': 'u=1, i',
          'referer': 'https://www.bilibili.com/',
          'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
        },
        body
      } as any));

      return this.ok(res, "短信发送成功");
    } catch (error) {
      return this.fail("短信发送失败", error);
    }
  }

  @Post("login")
  public async proxyBilibiliLogin(
    @Body() params: LoginRequestParams
  ): Promise<ApiResponse> {
    const urlString = "https://passport.bilibili.com/x/passport-login/web/login/sms";

    try {
      // 构造 x-www-form-urlencoded 格式请求
      const body = new URLSearchParams();
      body.append('source', params.source);
      body.append('tel', params.tel);
      body.append('code', params.code);
      body.append('keep', params.keep ? "true" : "false");
      body.append('go_url', params.go_url);
      body.append('cid', params.cid.toString());
      body.append('captcha_key', params.captcha_key);

      const resRaw = await ofetch.raw(urlString, ({
        method: "POST",
        headers: {
          'accept': '*/*',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'content-type': 'application/x-www-form-urlencoded',
          'origin': 'https://www.bilibili.com',
          'priority': 'u=1, i',
          'referer': 'https://www.bilibili.com/',
          'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
        },
        body
      } as any));

      // 处理所有 set-cookie 头（假设 headers.get('set-cookie') 返回数组）
  const setCookies = (resRaw as any)?.headers?.get?.('set-cookie');
      if (setCookies) {
        const cookiesArray = Array.isArray(setCookies) ? setCookies : [setCookies];
        cookiesArray.forEach(cookie => {
          const processedCookie = this.handleCookie(cookie);
          if (processedCookie) {
            this.setHeader('set-cookie', processedCookie);
          }
        });
      }

      return this.ok(resRaw._data, "登录成功");
    } catch (error) {
      return this.fail("登录失败", error);
    }
  }

  /**
   * 处理单个 set-cookie 字符串，仅针对 SESSDATA cookie 添加或修改属性（如 HttpOnly）。
   * 如果不是 SESSDATA，直接返回原字符串。
   * @param cookie 原 set-cookie 字符串
   * @returns 处理后的 cookie 字符串，或 undefined 如果无需处理
   */
  private handleCookie(cookie: string): string | undefined {
    const parts = cookie.split(';').map(part => part.trim());
    const mainPart = parts[0];
    if (!mainPart.startsWith('SESSDATA=')) {
      return cookie; // 非 SESSDATA，直接返回原字符串
    }

    // 解析属性到 Map
    const cookieProps = new Map<string, string>();
    parts.forEach(part => {
      const [key, value] = part.split('=', 2).map(item => item.trim());
      if (value !== undefined) {
        cookieProps.set(key, value);
      }
    });

    // 提取 SESSDATA 值
    const sessdataValue = cookieProps.get('SESSDATA');
    if (!sessdataValue) {
      return undefined;
    }

    // 构建新 cookie 字符串，确保包含 HttpOnly，并按标准顺序
    const newParts: string[] = [`SESSDATA=${sessdataValue}`];
    ['Path', 'Expires'].forEach(attr => {
      const value = cookieProps.get(attr);
      if (value) {
        newParts.push(`${attr}=${value}`);
      }
    });
    newParts.push('HttpOnly'); // 强制添加 HttpOnly（无值属性）
    newParts.push('SameSite=Lax');

    return newParts.join('; ');
  }
}
