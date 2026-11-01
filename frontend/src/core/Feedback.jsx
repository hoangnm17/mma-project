import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { Portal, Snackbar } from "react-native-paper";
import { api, errorText } from "./api";
import { palette } from "./visuals";

const Context = createContext(() => {});
export const useFeedback = () => useContext(Context);
const messages = {
  checkin: "Nhận phòng thành công.", checkout: "Thanh toán và trả phòng thành công.",
  "meal-assistant": "Đã lưu thông tin người bón thức ăn.",
  "meal-assistant-delete": "Đã xóa người bón thức ăn.",
  "special-request": "Đã đặt dịch vụ hỗ trợ.", "food-order": "Đã tạo đơn ăn uống.",
  receipt: "Đã ghi nhận thu tiền.", "receipt-return": "Hoàn tiền thành công.",
};
export default function FeedbackProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const sequence = useRef(0);
  const show = (message, success = true) => setCurrent({ message, success, id: ++sequence.current });
  useEffect(() => {
    const interceptor = api.interceptors.response.use(response => {
      if (["post", "put", "patch", "delete"].includes(response.config.method) && response.config.url !== "/auth/refresh") {
        const name = response.config.url.split("/").at(-1);
        const status = typeof response.config.data === "string" ? JSON.parse(response.config.data)?.status : response.config.data?.status;
        show(messages[name] || (name.endsWith("-status")
          ? status === "CANCELLED" ? "Đã hủy yêu cầu." : status === "COMPLETED" ? "Đã hoàn thành dịch vụ và ghi phí." : "Đã cập nhật trạng thái dịch vụ."
          : response.config.url.startsWith("/ai/") ? "Đã nhận kết quả từ trợ lý." : "Thao tác thành công."));
      }
      return response;
    }, error => {
      if (["post", "put", "patch", "delete"].includes(error.config?.method)) show(errorText(error), false);
      return Promise.reject(error);
    });
    return () => api.interceptors.response.eject(interceptor);
  }, []);
  const dismiss = () => setCurrent(null);
  return <Context.Provider value={show}>
    {children}
    <Portal><Snackbar key={current?.id} visible={!!current} onDismiss={dismiss} duration={5000}
      style={{ backgroundColor: current?.success ? palette.success : palette.error }}
      action={{ label: "Ẩn", onPress: dismiss }}>
      {current?.message || ""}
    </Snackbar></Portal>
  </Context.Provider>;
}
