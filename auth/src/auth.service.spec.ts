import { AuthService, JWT_SECRET } from "./auth.service";
import * as jwt from "jsonwebtoken";

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  it("logs in and receives a valid access token and refresh token", async () => {
    await service.register("carol", "mission123", ["MISSION_OPERATOR"]);
    const { accessToken, refreshToken } = await service.login("carol", "mission123");
    expect(typeof accessToken).toBe("string");
    expect(typeof refreshToken).toBe("string");
    expect(accessToken).not.toEqual(refreshToken);
  });

  it("issues an access token that validates and carries the right claims", async () => {
    await service.register("carol", "mission123", ["MISSION_OPERATOR"]);
    const { accessToken } = await service.login("carol", "mission123");
    const decoded = jwt.verify(accessToken, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.sub).toBe("carol");
    expect(decoded.roles).toEqual(["MISSION_OPERATOR"]);
  });

  it("rejects login with an incorrect password", async () => {
    await service.register("carol", "mission123", ["MISSION_OPERATOR"]);
    await expect(service.login("carol", "wrong-password")).rejects.toThrow();
  });
});
