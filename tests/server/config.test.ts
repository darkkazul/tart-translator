import { describe, expect, it } from "vitest";
import { getServerConfig } from "../../src/server/config";

describe("getServerConfig", () => {
  it("binds to loopback by default for safe macOS development", () => {
    expect(getServerConfig({}).host).toBe("127.0.0.1");
  });

  it("accepts all-interface binding for Docker and Unraid", () => {
    expect(getServerConfig({ TART_API_HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  });

  it("uses PORT for container-friendly port mapping", () => {
    expect(getServerConfig({ PORT: "8788" }).port).toBe(8788);
  });

  it("rejects invalid bind hosts", () => {
    expect(() => getServerConfig({ TART_API_HOST: "example.com" })).toThrow("Invalid TART_API_HOST");
  });
});
