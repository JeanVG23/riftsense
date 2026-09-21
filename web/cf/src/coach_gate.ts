import { apiCoach } from "./coach";
import { apiGameCoach } from "./game_coach";
import type { Env } from "./index";

/**
 * Une instance Durable Object par joueur. Le booléen vit dans l'instance unique et
 * reste pris jusqu'à la fermeture réelle du flux SSE, pas seulement jusqu'à la
 * construction de la Response.
 */
export class CoachGate {
  private active = false;
  private static readonly LOCK_TTL_MS = 30 * 60 * 1000;

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (this.active) {
      return Response.json({ detail: "an analysis is already in progress" }, { status: 409 });
    }
    this.active = true;
    try {
      const now = Date.now();
      const activeUntil = await this.state.storage.get<number>("active_until");
      if (activeUntil && activeUntil > now) {
        this.active = false;
        return Response.json({ detail: "an analysis is already in progress" }, { status: 409 });
      }
      await this.state.storage.put("active_until", now + CoachGate.LOCK_TTL_MS);
    } catch (error) {
      this.active = false;
      throw error;
    }
    let response: Response;
    try {
      const pathname = new URL(request.url).pathname;
      response = pathname === "/api/coach/game"
        ? await apiGameCoach(request, this.env)
        : await apiCoach(request, this.env);
    } catch (error) {
      this.active = false;
      await this.state.storage.delete("active_until");
      throw error;
    }
    if (!response.body) {
      this.active = false;
      await this.state.storage.delete("active_until");
      return response;
    }

    const reader = response.body.getReader();
    let released = false;
    const release = async () => {
      if (!released) {
        released = true;
        this.active = false;
        await this.state.storage.delete("active_until");
      }
    };
    const guarded = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            await release();
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          await release();
          controller.error(error);
        }
      },
      async cancel(reason) {
        await Promise.all([release(), reader.cancel(reason)]);
      },
    });
    return new Response(guarded, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
}
