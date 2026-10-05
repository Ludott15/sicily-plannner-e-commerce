import { describe, expect, it } from "vitest";
import { detectInAppBrowser } from "./in-app-browser";

// User agent reali (forma tipica) dei browser interni e dei browser normali.
const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 335.0.0.29.93 (iPhone15,2; iOS 17_5; it_IT; it; scale=3.00; 1179x2556; 612829127)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 Instagram 343.0.0.33.101 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; it_IT; 627400398)",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/476.0.0.49.109;FBBV/626016418;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/it_IT;FBOP/5;FBRV/628458018]",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/477.0.0.44.109;]",
  tiktokIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_36.0.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/it Region/IT BytedanceWebview/d8a21c6",
  tiktokAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 trill_360004 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/36.0.4 ByteLocale/it",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.103 Mobile Safari/537.36",
  chromeDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  firefoxDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0",
};

describe("rilevamento dei browser interni", () => {
  it.each([
    ["instagramIos", "instagram"],
    ["instagramAndroid", "instagram"],
    ["facebookIos", "facebook"],
    ["facebookAndroid", "facebook"],
    ["tiktokIos", "tiktok"],
    ["tiktokAndroid", "tiktok"],
  ] as const)("%s → %s", (ua, app) => {
    expect(detectInAppBrowser(UA[ua])).toBe(app);
  });

  it.each(["safariIos", "chromeAndroid", "chromeDesktop", "firefoxDesktop"] as const)(
    "%s: browser normale",
    (ua) => {
      expect(detectInAppBrowser(UA[ua])).toBeNull();
    },
  );

  it("senza user agent: browser normale", () => {
    expect(detectInAppBrowser(null)).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
  });

  it("parole simili nel testo non bastano", () => {
    expect(detectInAppBrowser("Mozilla/5.0 (X11; Linux x86_64) InstagramScraper-like/1.0")).toBeNull();
  });
});
