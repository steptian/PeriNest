/// <reference path="../node_modules/miniprogram-api-typings/index.d.ts" />

/** app.ts globalData 类型 */
declare namespace NodeJS {
  interface Global { }
}
declare interface IAppOption {
  globalData: {
    token: string;
    userInfo: WechatMiniprogram.UserInfo | null;
  };
}
