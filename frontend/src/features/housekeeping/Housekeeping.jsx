import React, { useState } from "react";
import { Button, Checkbox, Text } from "react-native-paper";
import { Screen, Panel, Dataset, useResource, ActionButton, usePage, Pager, Badge, vnTime, Dialog, Select, Field } from "../../core/ui";
import TaskForm from "./TaskForm";
export default function Housekeeping() {
  const [page, setPage] = usePage();
  const [creating, setCreating] = useState(false), [stayId, setStayId] = useState("");
  const [detail, setDetail] = useState(null), [checked, setChecked] = useState([]), [reason, setReason] = useState("");
  const q = useResource("tasks", { page });
  const stays = useResource("stays", { status: "OPEN" });
  return <Screen title="Dọn phòng" onRefresh={q.refetch}>
    <Button mode="contained" onPress={() => setCreating(true)}>Tạo yêu cầu thay khách</Button>
    <Dataset query={q}>{items => items.map(task => <Panel key={task.id} title={`Phòng ${task.roomNumber} · ${task.serviceName}`}>
      <Badge value={task.status} />
      <Text>{vnTime(task.windowStart)} → {vnTime(task.windowEnd)}</Text>
      <Button onPress={() => { setDetail(task); setChecked([]); setReason(""); }}>Chi tiết và xử lý</Button>
    </Panel>)}</Dataset>
    <Pager page={page} setPage={setPage} count={q.data?.length || 0} />
    <Dialog visible={creating} title="Yêu cầu dọn phòng" onDismiss={() => setCreating(false)}>
      <Select label="Lượt lưu trú" value={stayId} onChange={setStayId} options={(stays.data || []).map(stay => ({ value: stay.id, label: `Phòng ${stay.roomNumber} · ${stay.customerName}` }))} />
      {stayId && <TaskForm key={stayId} stayId={stayId} onSuccess={() => setCreating(false)} />}
    </Dialog>
    <Dialog visible={!!detail} title="Xử lý dọn phòng" onDismiss={() => setDetail(null)}>
      {detail && <>
        <Badge value={detail.status} /><Text>{detail.notes}</Text>
        {["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(detail.status) && !detail.deskStartedBy && <>
          <Field label="Lý do tiếp nhận (nếu đã giao người khác)" value={reason} onChangeText={setReason} />
          <ActionButton name="task-desk-start" body={{ taskId: detail.id, reason }} onSuccess={() => setDetail(null)}>Bắt đầu dọn trực tiếp</ActionButton>
        </>}
        {((detail.status === "IN_PROGRESS" && detail.deskStartedBy) || detail.status === "AWAITING_VERIFICATION") && <>
          {JSON.parse(detail.checklistJson).map(item => <Checkbox.Item key={item} label={item} status={checked.includes(item) ? "checked" : "unchecked"} onPress={() => setChecked(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])} />)}
          <ActionButton name={detail.status === "AWAITING_VERIFICATION" ? "task-verify" : "task-desk-complete"} body={{ taskId: detail.id, checklist: checked, passed: true }} disabled={checked.length !== JSON.parse(detail.checklistJson).length} onSuccess={() => setDetail(null)}>Xác nhận đã dọn xong</ActionButton>
        </>}
        {["PENDING", "ASSIGNED"].includes(detail.status) && detail.source !== "CHECKOUT" && <ActionButton name="task-cancel" body={{ taskId: detail.id }} onSuccess={() => setDetail(null)}>Hủy yêu cầu</ActionButton>}
        <Text>Bắt đầu: {vnTime(detail.deskStartedAt)} · Hoàn tất: {vnTime(detail.completedAt)}</Text>
      </>}
    </Dialog>
  </Screen>;
}
