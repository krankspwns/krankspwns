# Walking boarding sequence

Status: the user supplied an LTX-generated clip and approved its locally cleaned version for boarding on 2026-10-22. The approved video is installed as `public/last-train/boarding.mp4`, with `boarding-poster.webp` as its still fallback. The NiftyVid failures below are historical. No paid services were used by this task.

Earlier, Figma/Weave rejected a no-spend quote request with “Video models are only available on paid plans.” No Weave generation was started.

## Installed boarding clip

- Source: user upload `stationary_wide_shot_three_travellers_in_emerald.mp4`; approved cleaned export `last-train-boarding-cleaned.mp4`.
- Local repair: the lower-right watermark area was replaced with a feathered, vertically reflected patch of nearby platform reflections. There may be a subtle texture change in that corner. The original upload and the full-resolution cleaned export were preserved outside the game assets.
- Delivery: silent H.264 MP4, 1280 × 720, 25 fps, exactly 6 seconds, approximately 2 MB, with fast-start metadata. The source was 1920 × 1080 and 6.12 seconds with audio; the installed copy trims the final 0.12 seconds and removes audio. The poster is the installed clip's first frame.
- Review: source and cleaned frames were sampled throughout the clip. Travellers approach, lift their legs onto the steps and disappear into the carriage. The clip includes an additional leading traveller in navy and does not exactly preserve every portrait or outfit (the green outfit becomes a long dress). The user approved this clip as atmospheric group boarding; the separate room manifest remains authoritative for actual players and cabin numbers.
- Playback: muted inline playback follows elapsed server phase time, including a reload or late arrival. The same video element survives room updates, pauses and resumes. Completion never advances the room; the server retains its six-second timer. Reduced motion omits the video entirely; rejected playback and failed downloads show the still poster. The full 16:9 composition fits inside the scene so feet and steps remain visible on phones.
- Runtime: local files only, with no generation provider, external video host, new runtime package or service account dependency. The former platform zoom, fade and overlaid destination badge were removed.

## Integration verification

- `npm test` passed the build, API/rule, recovery, Grand Con and Last Train suites.
- Four dedicated Chromium browser tests passed with a twelve-player manifest: elapsed-time seeking on reload, persistent playback across updates and pause/resume, reduced motion without a video request, failed download fallback, rejected autoplay fallback, and server-timed cabin entry. Mobile and desktop screenshots confirmed the full frame and uncut checklist; an inherited fixed checklist height was removed.
- The existing 320px journey/settings test and twelve-phone journey through boarding, cabins, sequential night turns, speaking and vote reveal both passed.
- Media inspection confirmed exactly six seconds of H.264 video with no audio stream. Local serving returns `video/mp4` and supports byte-range seeking (206 for a valid range, 416 for an out-of-bounds range).

## Free alternatives checked

- [NiftyVid](https://igorcsis.github.io/nifty-vid/) / [project source](https://github.com/IgorCSIS/nifty-vid): the author documents no signup or API key, with public Wan 2.2 image-to-video inference. The live page caps video length at 4.5 seconds because its upstream free Space times out around five seconds. This is a candidate for a short experimental clip, not a verified six-second production solution. Earlier workspace requests received proxy CONNECT 403. On 2026-10-22, the demo and its public backend returned HTTP 200, image upload succeeded, and two anonymous generation jobs were accepted but failed. The shorter retry exposed an exhausted ZeroGPU runs quota. See the attempt record below. The separate NiftyVid Worker remains blocked by the workspace proxy.
- [Wan2.Video](https://wan2.video/free-ai-video-generator): advertises an anonymous free interface backed by public Gradio Spaces; queues, sleeping models and changing availability still apply. A completed anonymous generation has not been verified here.
- [Local Wan 2.2](https://github.com/Wan-Video/Wan2.2): open-source generation avoids a service account, but the official 5B example requires a GPU with at least 24GB VRAM. This workspace has no available NVIDIA GPU, about 9.7GB RAM, and no installed video-inference stack, so that path is not practical here.
- A custom animated boarding scene built with local code/artwork requires no external account, credits, or hosted inference. This is the directly available approach, but it is an illustrated animation and needs its own walk-cycle artwork, character motion, stair contact, lighting and doorway masking. Do not describe it as a generated cinematic video or install another camera-zoom stand-in.

## Free attempt record — 2026-10-22

- **Access:** `https://igorcsis.github.io/nifty-vid/` returned HTTP 200. Its live script identifies `https://nifty-vid.niftyai.workers.dev` and `https://cbensimon-wan2-2-fp8da-aoti-preview2.hf.space`. The Worker's `/health` request received proxy CONNECT 403; the public Space's `/` and `/config` returned HTTP 200. Generation used the documented public Space directly, through the normal workspace proxy.
- **API contract:** verified the live Gradio 6.0.1 `/config` input order against [NiftyVid's Worker source](https://github.com/IgorCSIS/nifty-vid/blob/main/worker/src/index.ts). No account, token, API key, paid endpoint or paid fallback was used.
- **Input:** uploaded the unchanged `public/last-train/platform.webp` (Git blob `0c20552b4a86249d04df619399c5fb87ff529b6f`) to `/gradio_api/upload` successfully. The standing and portrait sheets were inspected as visual references, but were not sent as additional model inputs. The platform contains no travellers, so cast identity would need particular scrutiny if a later attempt succeeds.
- **First job:** `/gradio_api/call/generate_video` accepted event `fbc79f19690f49ebb2ae5a58d7ffb76f`; its result stream returned `event: error` with `data: null`. Requested duration: 4.5 seconds.
- **Diagnostic retry:** `/gradio_api/queue/join` accepted event `c365e0360e0046e1ad71fe6d548b9fef` at rank 0, then `/gradio_api/queue/data` reported `process_completed`, `success: false`, title `ZeroGPU quota exceeded`. Requested duration: 3.5 seconds. The upstream error was:

  > You have exceeded your ZeroGPU runs limit. Authenticate with a Hugging Face token for more quota - https://huggingface.co/settings/tokens

  This is the backend's reported quota for this anonymous request context; it does not establish the user's personal account quota. No token was configured or requested, and no further jobs were submitted.
- **Shared settings:** 6 inference steps; guidance scales 1 and 1; seed 42 with randomization disabled; video quality 6; scheduler `UniPCMultistep`; flow shift 3.0; native 16 fps; safe mode false; display result true; no last-image keyframe. The negative prompt was taken unchanged from the live Space's component 13, matching NiftyVid's default. At guidance 1 the Space documents that the negative prompt is unused.
- **Result:** no MP4, poster or review frames were produced. The current game sequence and synchronized six-second timer were not changed. Normal-speed and frame-by-frame review remain pending, so no production video integration is justified.

Exact motion prompt sent for both jobs:

```text
Locked-off stationary three-quarter wide shot of this midnight luxury train platform. Three distinct adult travellers enter from the right in a staggered queue and walk left toward the open brightly lit carriage doorway in the left foreground. A woman in an emerald green silk blouse and dark green trousers leads, followed by a man in a navy three-piece suit carrying a small leather suitcase, then a woman in a burgundy blouse and trousers. Full bodies and feet remain visible. Natural alternating footsteps, bending knees and elbows, weight shifting onto each planted foot. The leading traveller turns into the doorway, plants one foot on the brass stair, lifts her body upward, steps across the threshold and disappears behind the door frame into the warm carriage. The others follow with staggered movement. Preserve the exact train, open doorway, brass steps, night lighting, wet platform and painterly semi-realistic style. Restrained steam. Camera and train remain still. No camera zoom or pan, no sliding figures, no morphing bodies, no duplicate faces, no text or logos.
```

A future free attempt needs available anonymous quota or a user-configured Hugging Face token with available free quota. Do not purchase credits, upgrade plans, or switch to a paid provider. Even a successful 3.5–4.5-second experiment must pass the review below before deciding how to fit the six-second boarding phase; do not replace missing walking action with a camera zoom.

## Follow-up free-account access check — 2026-10-22

After the user authorized trying the suggested free alternatives:

- Checked configured credential availability without reading or printing secrets. `HF_TOKEN`, `HUGGING_FACE_HUB_TOKEN`, and `HUGGINGFACEHUB_API_TOKEN` are not configured; the managed environment reports no secret bindings or outbound identities. An authenticated Hugging Face attempt could not be submitted.
- Tested `https://huggingface.co/login`, `https://app.runwayml.com/`, and `https://app.ltx.studio/` through the normal workspace proxy. All three failed with `Tunnel connection failed: 403 Forbidden`. The enforced destination policy permits the existing NiftyVid page and its specific public Space, but does not include those account/application domains.
- No connected browser control tool is available in this session. Runway and LTX's free account balances, available models and download terms have therefore not been verified in an account, and no generation was submitted to either service.
- No new generation jobs, account registrations, subscriptions or purchases were made during this follow-up. The earlier anonymous quota failure remains the latest generation result; no video exists to install.

The smallest next step is to configure a token from a **free Hugging Face account** as the workspace secret `HF_TOKEN`, with available free ZeroGPU quota. Supply it through environment secret settings, never chat or repository files. The already accessible public Space can then be retried with authenticated requests and no paid fallback. Do not use a paid account's over-quota credits.

## Visual direction

Use the existing first-class midnight train and its public cast as references:

- Carriage/platform: `public/last-train/platform.webp`
- Public cast, full-length outfits: `public/last-train/standing.webp`
- Portrait identities: `public/last-train/passengers.webp`

A stationary three-quarter view looks across the platform toward the open carriage door and its brass steps. Keep the full doorway and travellers' feet visible. Warm interior light spills onto the cool platform; restrained steam and reflections establish depth. Use the same painterly, semi-realistic treatment as the existing game art.

Travellers approach in an overlapping queue. Show natural alternating footsteps, knee and elbow movement, shifting weight, and luggage carried with purpose. Each traveller turns toward the entrance, steps onto the actual stair, transfers their weight upward, and disappears behind the door frame into the lit carriage. The train and door stay geometrically stable. No sliding cutouts, feet passing through the platform, duplicate faces, bodies changing shape, captions, logos, or interface graphics.

## Shot and timing

1. **0–1 seconds:** establish the open door and a queue already moving; the first traveller reaches the step.
2. **1–5 seconds:** several distinct travellers walk and board with staggered movement. Keep the camera stable so the action is clearly visible.
3. **5–6 seconds:** the final visible traveller crosses the threshold; the warm entrance holds briefly before the game's cabin transition.

A single six-second video cannot clearly introduce all twelve people one by one. The shot should depict a believable group boarding; the in-game manifest remains the exact record of who is playing. If the generated cast cannot reliably preserve all public identities, review the result before changing the production sequence.

## Integration requirements

- Silent, locally served MP4, with a poster and compact mobile/desktop framing; no external runtime dependency.
- Autoplay muted with `playsinline`; do not loop or block the server's synchronized six-second boarding timer.
- Seek to elapsed server time on late join/reload; pause and resume with the room.
- Respect reduced motion with a still poster. A failed autoplay or video download must still allow the journey to continue on schedule.
- Review the clip at normal speed and in individual frames before installing it, particularly feet/steps, facial consistency, silhouettes and the doorway occlusion.
