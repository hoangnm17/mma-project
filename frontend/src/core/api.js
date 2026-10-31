import { create } from "axios";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";
export const api = create({ baseURL: API_URL + "/api", timeout: 20000 });
export function authorize(token) {
  if (token) api.defaults.headers.common.Authorization = "Bearer " + token;
  else delete api.defaults.headers.common.Authorization;
}
export const requestId = () =>
  Date.now().toString(36) +
  "-" +
  Math.random().toString(36).slice(2) +
  "-" +
  Math.random().toString(36).slice(2);
export async function action(name, body, key = requestId()) {
  return (
    await api.post("/actions/" + name, body, {
      headers: { "Idempotency-Key": key },
    })
  ).data;
}
export async function read(resource, params) {
  return (await api.get("/" + resource, { params })).data;
}
export function errorText(error) {
  return (
    error.response?.data?.error ||
    (error.code === "ECONNABORTED"
      ? "Kết nối quá hạn. Hãy tải lại để kiểm tra kết quả trước khi thử lại."
      : "Không kết nối được máy chủ. Kiểm tra mạng và địa chỉ API.")
  );
}
