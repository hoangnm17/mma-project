import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
export async function exportCsv(csv) {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "StayFlow-bao-cao.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }
  const { File, Paths } = await import("expo-file-system");
  const file = new File(Paths.cache, "StayFlow-bao-cao.csv");
  file.create({ overwrite: true });
  file.write(csv);
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      dialogTitle: "Chia sẻ báo cáo StayFlow",
    });
}
