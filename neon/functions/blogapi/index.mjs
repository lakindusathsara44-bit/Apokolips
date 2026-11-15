import pg from "pg";
import webpush from "web-push";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const allowedOrigins = new Set(["https://www.apokolips.xyz", "https://apokolips.xyz"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugOk = s => typeof s === "string" && /^[a-z0-9-]{1,160}$/.test(s);
const json = (body, status=200, origin="https://www.apokolips.xyz") => new Response(JSON.stringify(body), {status, headers:{
  "content-type":"application/json; charset=utf-8",
  "access-control-allow-origin": origin,
  "access-control-allow-methods":"GET,POST,PATCH,OPTIONS",
  "access-control-allow-headers":"content-type,x-blog-webhook-secret",
  "vary":"Origin"
}});
async function rateLimit(visitorId, action, max, windowMinutes) {
  const q = await pool.query(
    `insert into public.apokolips_blog_rate_limits(visitor_id, action, window_started_at, request_count)
     values($1,$2,now(),1)
     on conflict(visitor_id,action) do update set
       window_started_at = case when public.apokolips_blog_rate_limits.window_started_at < now() - ($4 * interval '1 minute') then now() else public.apokolips_blog_rate_limits.window_started_at end,
       request_count = case when public.apokolips_blog_rate_limits.window_started_at < now() - ($4 * interval '1 minute') then 1 else public.apokolips_blog_rate_limits.request_count + 1 end
     where public.apokolips_blog_rate_limits.window_started_at < now() - ($4 * interval '1 minute')
        or public.apokolips_blog_rate_limits.request_count < $3
     returning request_count`,
    [visitorId, action, max, windowMinutes]
  );
  return q.rowCount > 0;
}
async function sendNotificationPush(notification) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://www.apokolips.xyz", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const { rows } = await pool.query("select id,endpoint,p256dh,auth from public.apokolips_blog_push_subscriptions where visitor_id=$1", [notification.recipient_visitor_id]);
  await Promise.all(rows.map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
        title: notification.title, body: notification.body, url: notification.target_url, notificationId: notification.id
      }));
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await pool.query("delete from public.apokolips_blog_push_subscriptions where id=$1", [subscription.id]);
      } else {
        console.warn("web-push-delivery-failed", error?.statusCode || error?.message);
      }
    }
  }));
}
export default {
 async fetch(req) {
  const origin = req.headers.get("origin") || "https://www.apokolips.xyz";
  if (req.method==="OPTIONS") return new Response(null,{status:204,headers:{
    "access-control-allow-origin": allowedOrigins.has(origin)?origin:"https://www.apokolips.xyz",
    "access-control-allow-methods":"GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers":"content-type,x-blog-webhook-secret",
    "access-control-max-age":"86400","vary":"Origin"
  }});
  if (!allowedOrigins.has(origin)) return json({error:"Origin not allowed"},403);
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/,"");
  try {
   if (req.method==="GET" && path.endsWith("/health")) {
     await pool.query("select 1"); return json({ok:true,service:"apokolips-blog-neon"});
   }
   if (req.method==="GET" && path.endsWith("/push/config")) {
     if (!process.env.VAPID_PUBLIC_KEY) return json({error:"Push notifications need new VAPID keys to be configured."},503,origin);
     return json({publicKey:process.env.VAPID_PUBLIC_KEY},200,origin);
   }
   if (req.method==="GET" && path.endsWith("/stats")) {
     const {rows}=await pool.query("select (select count(*)::int from public.apokolips_blog_reactions) as reactions, (select count(*)::int from public.apokolips_blog_comments) as comments");
     return json(rows[0],200,origin);
   }
   if (req.method==="GET" && path.endsWith("/comments")) {
     const slug=url.searchParams.get("post_slug");
     if(!slugOk(slug)) return json({error:"Invalid post slug"},400,origin);
     const {rows}=await pool.query("select id,parent_comment_id,visitor_id,display_name,body,created_at,post_slug from public.apokolips_blog_comments where post_slug=$1 order by created_at asc limit 200",[slug]);
     return json({data:rows},200,origin);
   }
   if (req.method==="GET" && path.endsWith("/reactions")) {
     const slug=url.searchParams.get("post_slug");
     if(!slugOk(slug)) return json({error:"Invalid post slug"},400,origin);
     const {rows}=await pool.query("select reaction,visitor_id,id,post_slug from public.apokolips_blog_reactions where post_slug=$1",[slug]);
     return json({data:rows},200,origin);
   }
   if (req.method==="GET" && path.endsWith("/notifications")) {
     const visitorId=url.searchParams.get("visitor_id");
     if(!uuid.test(visitorId||"")) return json({error:"Invalid visitor id"},400,origin);
     const {rows}=await pool.query("select id,title,body,target_url,created_at,read_at,recipient_visitor_id from public.apokolips_blog_notifications where recipient_visitor_id=$1 order by created_at desc limit 30",[visitorId]);
     return json({data:rows},200,origin);
   }
   if (req.method==="GET" && path.endsWith("/subscriptions")) {
     const visitorId=url.searchParams.get("visitor_id"), endpoint=url.searchParams.get("endpoint");
     if(!uuid.test(visitorId||"")) return json({error:"Invalid visitor id"},400,origin);
     const q=await pool.query("select id from public.apokolips_blog_push_subscriptions where visitor_id=$1 and ($2::text is null or endpoint=$2) limit 1",[visitorId,endpoint||null]);
     return json({data:q.rows[0]||null},200,origin);
   }
   if (req.method==="POST" && path.endsWith("/comments")) {
     const b=await req.json(), visitorId=String(b.visitor_id||""), name=String(b.display_name||"").trim(), body=String(b.body||"").trim(), slug=b.post_slug, parent=b.parent_comment_id||null;
     if(!uuid.test(visitorId)||!slugOk(slug)||!name||name.length>40||!body||body.length>500||(parent&&!uuid.test(parent))) return json({error:"Invalid comment data"},400,origin);
     if(!await rateLimit(visitorId,"comment",5,10)) return json({error:"Please wait before posting another comment."},429,origin);
     if(parent){const p=await pool.query("select id from public.apokolips_blog_comments where id=$1 and post_slug=$2",[parent,slug]); if(!p.rowCount)return json({error:"Reply target not found"},404,origin);}
     const q=await pool.query("insert into public.apokolips_blog_comments(post_slug,visitor_id,display_name,body,parent_comment_id) values($1,$2,$3,$4,$5) returning id,parent_comment_id,visitor_id,display_name,body,created_at,post_slug",[slug,visitorId,name,body,parent]);
     const notifications = await pool.query("select id,recipient_visitor_id,title,body,target_url from public.apokolips_blog_notifications where source_id=$1 and notification_type='reply'", [q.rows[0].id]);
     await Promise.all(notifications.rows.map(sendNotificationPush));
     return json({data:q.rows[0]},201,origin);
   }
   if (req.method==="POST" && path.endsWith("/reactions")) {
     const b=await req.json(), visitorId=String(b.visitor_id||""), slug=b.post_slug, reaction=b.reaction;
     if(!uuid.test(visitorId)||!slugOk(slug)||!["like","love","wow","fire"].includes(reaction))return json({error:"Invalid reaction data"},400,origin);
     if(!await rateLimit(visitorId,"reaction",30,10))return json({error:"Too many reactions. Please wait."},429,origin);
     const q=await pool.query("insert into public.apokolips_blog_reactions(post_slug,visitor_id,reaction) values($1,$2,$3) on conflict(post_slug,visitor_id) do update set reaction=excluded.reaction,updated_at=now() returning id",[slug,visitorId,reaction]);
     return json({data:q.rows},200,origin);
   }
   if (req.method==="PATCH" && path.endsWith("/notifications")) {
     const b=await req.json(), visitorId=String(b.visitor_id||""), id=String(b.id||"");
     if(!uuid.test(visitorId)||!uuid.test(id))return json({error:"Invalid notification data"},400,origin);
     await pool.query("update public.apokolips_blog_notifications set read_at=coalesce(read_at,now()) where id=$1 and recipient_visitor_id=$2",[id,visitorId]);
     return json({ok:true},200,origin);
   }
   if (req.method==="POST" && path.endsWith("/subscriptions")) {
     const b=await req.json(), visitorId=String(b.visitor_id||"");
     if(!uuid.test(visitorId)||typeof b.endpoint!=="string"||!b.endpoint.startsWith("https://")||typeof b.p256dh!=="string"||typeof b.auth!=="string")return json({error:"Invalid subscription"},400,origin);
     if(!await rateLimit(visitorId,"subscription",5,60))return json({error:"Too many subscription attempts"},429,origin);
     const q=await pool.query("insert into public.apokolips_blog_push_subscriptions(visitor_id,endpoint,p256dh,auth,user_agent) values($1,$2,$3,$4,$5) on conflict(endpoint) do update set visitor_id=excluded.visitor_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,updated_at=now() returning id",[visitorId,b.endpoint,b.p256dh,b.auth,String(b.user_agent||"").slice(0,500)]);
     return json({data:q.rows[0]},200,origin);
   }
   if (req.method==="POST" && path.endsWith("/media-event")) {
     if(!process.env.APOKOLIPS_BLOG_WEBHOOK_SECRET || req.headers.get("x-blog-webhook-secret")!==process.env.APOKOLIPS_BLOG_WEBHOOK_SECRET)return json({error:"Unauthorized"},401,origin);
     const b=await req.json(), file=String(b.file_path||"");
     if(!/^[\w./% -]{1,500}\.(jpe?g|png|webp|gif)$/i.test(file)||file.includes(".."))return json({error:"Invalid media path"},400,origin);
     const event = await pool.query("insert into public.apokolips_blog_media_events(file_path) values($1) on conflict(file_path) do nothing returning id",[file]);
     if (event.rows[0]) {
       const notifications = await pool.query("select id,recipient_visitor_id,title,body,target_url from public.apokolips_blog_notifications where source_id=$1 and notification_type='new_photo'", [event.rows[0].id]);
       await Promise.all(notifications.rows.map(sendNotificationPush));
     }
     return json({ok:true},200,origin);
   }
   return json({error:"Not found"},404,origin);
  } catch(e) {
   console.error("blog-api-error",e);
   return json({error:"The blog service could not complete the request."},500,origin);
  }
 }
};
