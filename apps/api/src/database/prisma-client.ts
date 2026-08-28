import { PrismaPg } from "@prisma/adapter-pg";

export interface PrismaAdapterOptions {
	connectionString: string;
	connectionTimeoutMillis: number;
	max: number;
}

export function createPrismaAdapter(options: PrismaAdapterOptions): PrismaPg {
	return new PrismaPg(options);
}
