export const dynamic='force-dynamic';
const retired=()=>Response.json({error:'هذه الخدمة أُلغيت نهائيًا'},{status:410,headers:{'Cache-Control':'no-store'}});
export const GET=retired;
export const POST=retired;
