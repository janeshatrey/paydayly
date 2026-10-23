import type { NextFunction, Request, Response } from "express"
import { z, type ZodType } from "zod"

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function body<T>(schema: ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue.path.join(".")
    throw new HttpError(400, field ? `${field}: ${issue.message}` : issue.message)
  }
  return result.data
}

export function query<T>(schema: ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.query)
  if (!result.success) throw new HttpError(400, result.error.issues[0].message)
  return result.data
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: "The request body is not valid JSON." })
    return
  }
  console.error(err)
  res.status(500).json({ error: "Something went wrong on our side." })
}

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, "That date does not exist")
export const paise = z.number().int().min(0).max(1_000_000_000_00)
