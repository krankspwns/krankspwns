// On Vercel without a database, rooms live only in one server instance's memory and vanish when it is recycled. Every
// room API tells the page with a header, so players see a warning instead of silently losing their room.
const unsaved = () => !(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && !!process.env.VERCEL;
const mark = (res) => { if (unsaved()) res.setHeader('X-Storage-Warning', '1'); };
module.exports = { unsaved, mark };
