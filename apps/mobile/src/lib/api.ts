import { ApiClient } from "@city-wallet/api-client";
import { apiBaseUrl } from "./config";

export const api = new ApiClient({ baseUrl: apiBaseUrl });
