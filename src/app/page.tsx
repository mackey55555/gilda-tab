import { redirect } from "next/navigation";

// 営業用画面が本体なので、ルートは /floor に寄せる。
export default function Home() {
  redirect("/floor");
}
