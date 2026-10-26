import type { Request } from 'express';
import { Types } from 'mongoose';
import { z, type ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors';

function parse<S extends ZodTypeAny>(schema: S, value: unknown, where: string): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(
      `Invalid ${where}`,
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const body = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => parse(schema, req.body ?? {}, 'request body');
export const query = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => parse(schema, req.query, 'query parameters');
export const params = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => parse(schema, req.params, 'path parameters');

export const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v) && /^[a-f\d]{24}$/i.test(v), 'Must be a valid id')
  .transform((v) => new Types.ObjectId(v));

export const idParam = <K extends string>(name: K) =>
  z.object({ [name]: objectId } as { [P in K]: typeof objectId });
