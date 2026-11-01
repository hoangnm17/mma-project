const base = require("./config/app-base.json").expo;
module.exports = () => {
  const demoLan = process.env.DEMO_LAN === "true";
  const url = process.env.EXPO_PUBLIC_API_URL || "";
  const privateHttp =
    /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?\/?$/.test(
      url,
    );
  if (
    ["preview", "production"].includes(process.env.APP_ENV) &&
    !/^https:\/\/[^/]+/.test(url) &&
    !(process.env.APP_ENV === "preview" && demoLan && privateHttp)
  )
    throw Error(
      "Cần API HTTPS hoặc preview DEMO_LAN với địa chỉ IPv4 mạng riêng.",
    );
  return {
    ...base,
    name: "StayFlow",
    ...(process.env.EAS_OWNER ? { owner: process.env.EAS_OWNER } : {}),
    scheme: "stayflow",
    userInterfaceStyle: "light",
    android: {
      ...base.android,
      package: base.android?.package || "vn.stayflow.mobile",
      ...(process.env.GOOGLE_SERVICES_JSON
        ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
        : {}),
    },
    plugins: [
      ...base.plugins.filter(
        (p) =>
          !["expo-notifications", "expo-build-properties"].includes(
            Array.isArray(p) ? p[0] : p,
          ),
      ),
      "expo-notifications",
      ["expo-image-picker", { photosPermission: "Cho phép StayFlow chọn ảnh người bón thức ăn.", cameraPermission: false, microphonePermission: false }],
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic:
              demoLan && process.env.APP_ENV !== "production",
          },
        },
      ],
    ],
    experiments: { ...base.experiments, typedRoutes: false },
    extra: {
      ...base.extra,
      ...(process.env.EAS_PROJECT_ID
        ? { eas: { ...base.extra?.eas, projectId: process.env.EAS_PROJECT_ID } }
        : {}),
    },
  };
};
