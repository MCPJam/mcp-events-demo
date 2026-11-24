# Jensen comeback demo on MCPJam staging

Tested November 23, 2026 in Project 2 with the saved HTTP server **Jensen is back**.

| User story | Result | Observed evidence |
| --- | --- | --- |
| As a presenter, I can connect and open the controls from Playground. | Pass | Fresh Chrome tab connected using the saved entry. Running open_show rendered the video controls inside MCPJam. |
| As a presenter, I can start the couch scene and see Jensen appear on stage. | Pass | The player showed the Board message, called cue_scene at the mid-bite cue, then loaded and played the stage entrance. |
| As a presenter, I can advance automatically to the locker room and manually play the Wolf speech. | Pass | Enabling the checkbox advanced at the end of the stage clip. Clicking Wolf speech loaded the speech in the same player. |
| As a subscriber, I can receive each scene through the beta Events extension. | Pass | An independent SDK client subscribed with a scene filter. The stage, locker-room, and wolf delivery IDs each matched the corresponding tool receipt. |
| As a trigger author, I can select the real hosted subscription and enable my instructions. | Pass | Jensen comeback scenes uses the active jensen.returned poll subscription. |
| As a trigger author, I can see a completed run for a real delivery. | Blocked on staging | Run history stayed empty after real cues. The worker reported the inbox append failure described below. |

## Client and hosted-service bugs

1. **Schema snapshots reject a valid JSON Schema keyword.** In Events, select a descriptor generated from the official SDK's Zod schema, then click Subscribe. Staging displays “Field name $schema starts with a '$', which is reserved.” Expect a saved subscription. The Jensen server now supplies an equivalent explicit JSON Schema via the SDK and its subscription succeeds. The generic fixture still provides a reproduction case.
2. **Active polling cannot append deliveries to the hosted inbox.** Connect the Jensen server, subscribe to jensen.returned with Poll, create a trigger using that subscription, and cue a scene from Playground. In Events the subscription reports “Event inbox append failed (unexpected response: admin_token_not_configured)” and retries. Received stays empty and the trigger has no runs. The feed also displays “The events feed is not configured on this deployment.” Expect one inbox entry and a trigger run trace. No shared client or deployment configuration was changed.

The embedded player plays after the publisher acknowledges a cue. The independent Events subscription and the native Triggers tab exercise separate paths.
