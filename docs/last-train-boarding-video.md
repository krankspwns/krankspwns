# Walking boarding sequence

Status: proposed video production, not yet generated or installed. The available video-generation connector currently requires the user's Figma account to be linked to Weave. A model and generation cost must be quoted and approved before starting a paid run.

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
