import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getDb } from '../db/client.js';
import { users, type User } from '../db/schema.js';

export interface DemoUserVariables {
  user: DemoUser;
}

export interface DemoUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

const DEFAULT_DEMO_EMAIL = 'matt@premiertreesllc.com';

function userToDemo(row: User): DemoUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
  };
}

function fallbackUser(email: string): DemoUser {
  return {
    id: `demo-${email}`,
    email,
    displayName: email,
    role: 'call_taker',
  };
}

export const demoUserMiddleware: MiddlewareHandler<{ Variables: DemoUserVariables }> = async (
  c,
  next,
) => {
  const headerValue = c.req.header('x-demo-user');
  const email = headerValue?.trim() || DEFAULT_DEMO_EMAIL;

  let demo: DemoUser;
  try {
    const db = getDb();
    const found = db.select().from(users).where(eq(users.email, email)).all();
    demo = found.length > 0 ? userToDemo(found[0] as User) : fallbackUser(email);
  } catch {
    demo = fallbackUser(email);
  }

  c.set('user', demo);
  await next();
};
