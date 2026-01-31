// Evita errores del IDE cuando TS del frontend mira estos ficheros
declare const Deno: {
  env: { get(key: string): string | undefined };
};
