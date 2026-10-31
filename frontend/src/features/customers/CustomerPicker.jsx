import React, { useEffect, useState } from "react";
import { Button, Text } from "react-native-paper";
import { Field, ErrorMessage, useResource } from "../../core/ui";

export function customerBody(form) {
  if (!form.customer?.phone?.trim()) return { customerId: form.customerId || undefined, customer: undefined };
  return {
    customerId: form.customerId || undefined,
    customer: form.customer,
  };
}

export function customerReady(form) {
  return !!form.customerId ||
    (form.customer?.phone?.replace(/\D/g, "").length >= 8 &&
      form.customer?.name?.trim().length >= 2);
}

export default function CustomerPicker({ form, onChange }) {
  const customer = form.customer || { name: "", phone: "", notes: "" };
  const phone = customer.phone || "";
  const [lookupPhone, setLookupPhone] = useState(phone);
  useEffect(() => { const timer = setTimeout(() => setLookupPhone(phone), 300); return () => clearTimeout(timer); }, [phone]);
  const canLookup = phone.replace(/\D/g, "").length >= 8;
  const lookup = useResource("customer-lookup", { phone: lookupPhone }, canLookup && phone === lookupPhone);
  useEffect(() => {
    if (phone === lookupPhone && canLookup && lookup.data && !form.customerId) {
      onChange({
        ...form,
        customerId: lookup.data.id,
        customer: {
          name: lookup.data.name,
          phone,
          notes: lookup.data.notes || "",
        },
      });
    }
  }, [lookup.data, form, onChange, phone, lookupPhone, canLookup]);
  return (
    <>
      <Field
        label="Điện thoại khách hàng"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={(value) => onChange({
          ...form,
          customerId: "",
          customer: { phone: value, name: "", notes: "" },
        })}
      />
      {form.customerId && !phone ? (
        <>
          <Text>Khách hiện tại: {form.customerName || "Đã liên kết hồ sơ"}</Text>
          <Button onPress={() => onChange({ ...form, customerId: "", customer: { phone: "", name: "", notes: "" } })}>
            Đổi khách
          </Button>
        </>
      ) : (
        <>
          {canLookup && (lookup.isFetching || phone !== lookupPhone) && <Text>Đang tìm…</Text>}
          <ErrorMessage error={lookup.error} />
          {form.customerId ? <Text>Khách đã có hồ sơ</Text>
            : canLookup && phone === lookupPhone && lookup.isSuccess && <Text>Khách mới</Text>}
          <Field label="Họ tên khách" value={customer.name}
            onChangeText={(name) => onChange({ ...form, customer: { ...customer, name } })} />
          <Field label="Ghi chú khách (tùy chọn)" value={customer.notes}
            onChangeText={(notes) => onChange({ ...form, customer: { ...customer, notes } })} />
        </>
      )}
    </>
  );
}
