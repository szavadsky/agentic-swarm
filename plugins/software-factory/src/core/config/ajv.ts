import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

export function createAjv(): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    useDefaults: true,
  });
  addFormats(ajv);
  return ajv;
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return "Validation failed with unknown error";
  return errors
    .map((err) => {
      const path = err.instancePath ? err.instancePath : "/";
      const message = err.message ?? "is invalid";
      const detail =
        err.params && Object.keys(err.params).length > 0
          ? ` (${JSON.stringify(err.params)})`
          : "";
      return `${path}: ${message}${detail}`;
    })
    .join("\n");
}
