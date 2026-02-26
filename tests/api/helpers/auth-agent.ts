import request from "supertest";
import type { Express } from "express";

type LoginParams = {
  email?: string;
  password?: string;
};

export async function createAuthenticatedAgent(app: Express, params: LoginParams = {}) {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({
    email: params.email || "user@example.com",
    password: params.password || "correct-password",
  });

  if (response.status !== 200) {
    throw new Error(`Login failed in test helper. Status: ${response.status}`);
  }

  return agent;
}
