import React, { useState } from "react";
import { Image } from "react-native";
import { Button, Text } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Screen, Panel, Field, Select, Dataset, Dialog, Pager, useResource, useAction, ActionButton, ErrorMessage } from "../../core/ui";
import { useSession } from "../../core/session";
import { useFeedback } from "../../core/Feedback";

const fields = [
  ["birthYear", "Năm sinh"], ["height", "Chiều cao (cm)"],
  ["bust", "Vòng 1 (cm)"], ["waist", "Vòng 2 (cm)"], ["hips", "Vòng 3 (cm)"], ["weight", "Cân nặng (kg)"],
];
function AssistantInfo({ person }) {
  return <>
    {!!person.photo && <Image source={{ uri: person.photo }} accessibilityLabel={`Ảnh ${person.name}`} style={{ width: 140, height: 160, borderRadius: 12 }} />}
    <Text>{person.status === "AVAILABLE" ? "Sẵn sàng phục vụ" : "Đang phục vụ"}</Text>
    <Text>Năm sinh: {person.birthYear} · Cao: {person.height} cm · Nặng: {person.weight} kg</Text>
    <Text>Số đo 3 vòng: {person.bust} – {person.waist} – {person.hips} cm</Text>
  </>;
}

export function MealAssistantPicker({ value, onChange }) {
  const [page, setPage] = useState(1);
  const people = useResource("meal-assistants", { status: "AVAILABLE", page });
  return <Panel title="Đặt người bón thức ăn">
    <Text>Chỉ những người sẵn sàng phục vụ mới có thể được đặt. Người được đặt sẽ được giữ cho yêu cầu này.</Text>
    {!!value && <><Text>Đã chọn: {value.name}</Text><Button onPress={() => onChange(null)}>Bỏ chọn người bón</Button></>}
    <Dataset query={people} empty="Hiện chưa có người bón sẵn sàng phục vụ.">
      {items => items.map(person => <Panel key={person.id} title={person.name}>
        <AssistantInfo person={person} />
        <Button mode={value?.id === person.id ? "contained" : "outlined"} onPress={() => onChange(person)}>
          {value?.id === person.id ? "Đã chọn" : "Chọn người bón này"}
        </Button>
      </Panel>)}
    </Dataset>
    <Pager page={page} setPage={setPage} count={people.data?.length || 0} />
    <Button onPress={() => people.refetch()}>Tải lại danh sách sẵn sàng</Button>
  </Panel>;
}

export default function MealAssistants() {
  const { session } = useSession();
  const admin = session?.user?.role === "Admin";
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [picking, setPicking] = useState(false);
  const people = useResource("meal-assistants", { page, ...(status ? { status } : {}) }, admin);
  const mutation = useAction();
  const feedback = useFeedback();
  async function pickPhoto() {
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 1 });
      if (result.canceled) return;
      const asset = result.assets[0];
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize(asset.width >= asset.height ? { width: Math.min(asset.width || 640, 640) } : { height: Math.min(asset.height || 640, 640) });
      const image = await context.renderAsync();
      const compressed = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
      if (!compressed.base64 || compressed.base64.length > 666668) throw Error("Không thể tối ưu ảnh. Hãy chọn ảnh khác nhỏ hơn.");
      setForm(current => current && ({ ...current, photo: `data:image/jpeg;base64,${compressed.base64}` }));
      feedback("Đã chọn ảnh. Bấm Lưu để tải ảnh lên hồ sơ.");
    } catch (error) { feedback(error.message || "Không thể mở thư viện ảnh.", false); }
    finally { setPicking(false); }
  }
  if (!admin) return <Screen title="Người bón thức ăn"><Text>Chỉ quản trị viên được quản lý người bón thức ăn.</Text></Screen>;
  const valid = form && form.name.trim().length >= 2 && fields.every(([key]) => form[key] !== "" && Number.isInteger(Number(form[key]))) &&
    Number(form.birthYear) >= 1900 && Number(form.birthYear) <= new Date().getFullYear() &&
    Number(form.height) >= 50 && Number(form.height) <= 250 && Number(form.weight) >= 10 && Number(form.weight) <= 300 &&
    ["bust", "waist", "hips"].every(key => Number(form[key]) >= 20 && Number(form[key]) <= 250);
  return <Screen title="Quản lý người bón thức ăn" onRefresh={people.refetch} refreshing={people.isRefetching}>
    <Button mode="contained" icon="plus" onPress={() => { mutation.reset(); setForm({ name: "", birthYear: "", height: "", bust: "", waist: "", hips: "", weight: "", status: "AVAILABLE", photo: null }); }}>Thêm người bón</Button>
    <Select label="Trạng thái phục vụ" value={status} onChange={value => { setStatus(value); setPage(1); }} options={[
      { value: "", label: "Tất cả" }, { value: "AVAILABLE", label: "Sẵn sàng phục vụ" }, { value: "SERVING", label: "Đang phục vụ" },
    ]} />
    <Dataset query={people} empty="Chưa có người bón phù hợp.">{items => items.map(person => <Panel key={person.id} title={person.name}>
      <AssistantInfo person={person} />
      <Button onPress={() => { mutation.reset(); setForm({ ...person }); }}>Chỉnh sửa</Button>
      <Button disabled={person.status === "SERVING"} onPress={() => setDeleting(person)}>Xóa người bón</Button>
    </Panel>)}</Dataset>
    <Pager page={page} setPage={setPage} count={people.data?.length || 0} />
    <Dialog title={form?.id ? "Chỉnh sửa người bón" : "Thêm người bón"} visible={!!form} onDismiss={() => { if (!mutation.isPending && !picking) setForm(null); }}>
      {form && <>
        <Field label="Tên" value={form.name} maxLength={120} onChangeText={name => setForm({ ...form, name })} />
        {fields.map(([key, label]) => <Field key={key} label={label} keyboardType="numeric" value={form[key]} onChangeText={value => setForm({ ...form, [key]: value })} />)}
        <Text>Nhập chiều cao, cân nặng và số đo bằng số nguyên.</Text>
        <Select label="Trạng thái" value={form.status} onChange={status => setForm({ ...form, status })} options={[{ value: "AVAILABLE", label: "Sẵn sàng phục vụ" }, { value: "SERVING", label: "Đang phục vụ" }]} />
        {!!form.photo && <Image source={{ uri: form.photo }} style={{ width: 140, height: 160, borderRadius: 12 }} />}
        <Button icon="image-plus" loading={picking} disabled={picking || mutation.isPending} onPress={pickPhoto}>Chọn / đổi ảnh từ thiết bị</Button>
        {!!form.photo && <Button disabled={picking || mutation.isPending} onPress={() => setForm({ ...form, photo: null })}>Gỡ ảnh</Button>}
        <ErrorMessage error={mutation.error} />
        <Button mode="contained" loading={mutation.isPending} disabled={!valid || picking || mutation.isPending} onPress={() => mutation.mutate({ name: "meal-assistant", body: {
          ...(form.id ? { id: form.id } : {}), name: form.name, status: form.status, photo: form.photo,
          ...Object.fromEntries(fields.map(([key]) => [key, Number(form[key])])),
        } }, { onSuccess: () => setForm(null) })}>Lưu người bón</Button>
      </>}
    </Dialog>
    <Dialog title="Xóa người bón" visible={!!deleting} onDismiss={() => setDeleting(null)}>
      <Text>Xóa {deleting?.name} khỏi danh sách phục vụ? Lịch sử đơn đã đặt vẫn được giữ lại.</Text>
      {deleting && <ActionButton name="meal-assistant-delete" body={{ id: deleting.id }} onSuccess={() => setDeleting(null)}>Xác nhận xóa</ActionButton>}
    </Dialog>
  </Screen>;
}
