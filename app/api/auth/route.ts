import { json } from "@/lib/server";
const retired = () => json({ error: "已取消密码登录，请从头像切换账号" }, 410);
export const POST = retired;
export const DELETE = retired;
