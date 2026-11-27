/** The named-semaphore declaration shape shared by the three config layers. */

import { z } from "zod";

/**
 * `{name, max}` declarations. Names are global across layers, so a name may be
 * declared again elsewhere; within one layer a repeat is a typo, refused here.
 */
export const semaphoreDeclarationsSchema = z
  .array(
    z
      .object({
        name: z.string().min(1),
        max: z.number().int().positive(),
      })
      .strict(),
  )
  .default([])
  .superRefine((declarations, ctx) => {
    const seen = new Set<string>();
    for (const [index, declaration] of declarations.entries()) {
      if (seen.has(declaration.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `semaphore "${declaration.name}" is declared twice in this layer`,
          path: [index, "name"],
        });
      }
      seen.add(declaration.name);
    }
  });
