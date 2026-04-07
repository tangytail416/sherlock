import { PrismaClient } from '@prisma/client';

// --- Timestamp Conversion Logic ---
const unixSecondsRegex = /\b(1[6-9]\d{8})\b/g;
const unixMilliRegex = /\b(1[6-9]\d{11})\b/g;

function convertTimestampsInString(str: string): string {
  if (typeof str !== 'string') return str;
  let result = str.replace(unixSecondsRegex, (match) => {
    return new Date(parseInt(match) * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  });
  result = result.replace(unixMilliRegex, (match) => {
    return new Date(parseInt(match)).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  });
  return result;
}

function convertTimestampsInObj(obj: any): any {
  if (obj === null || obj === undefined) return obj;
	if (obj instanceof Date) {
    return obj; // Leave native Date objects completely alone
  }
  if (typeof obj === 'number') {
    // 10-digit timestamp (seconds)
    if (obj >= 1600000000 && obj <= 1999999999) {
      return new Date(obj * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    }
    // 13-digit timestamp (milliseconds)
    if (obj >= 1600000000000 && obj <= 1999999999999) {
      return new Date(obj).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    }
    return obj;
  }

  if (typeof obj === 'string') {
    return convertTimestampsInString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(convertTimestampsInObj);
  }

  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      newObj[key] = convertTimestampsInObj(obj[key]);
    }
    return newObj;
  }

  return obj;
}

// --- Prisma Client Setup with Interceptor Extension ---

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends({
    query: {
      alert: {
        // Intercept single alert creation
        async create({ args, query }) {
          if (args.data.description && typeof args.data.description === 'string') {
            args.data.description = convertTimestampsInString(args.data.description);
          }
          if (args.data.rawData) {
            args.data.rawData = convertTimestampsInObj(args.data.rawData);
          }
          return query(args);
        },
        // Intercept bulk alert creation (just in case)
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((alert: any) => {
              if (alert.description && typeof alert.description === 'string') {
                alert.description = convertTimestampsInString(alert.description);
              }
              if (alert.rawData) {
                alert.rawData = convertTimestampsInObj(alert.rawData);
              }
              return alert;
            });
          }
          return query(args);
        }
      }
    }
  });
};

// We use ReturnType to infer the type of the extended Prisma client
type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;