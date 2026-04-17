import { apiRequest } from "@/api/client";
import type {
  DeleteDataRequestResponse,
  UserDataExportResponse,
} from "@/types/api";

export function fetchUserDataExport() {
  return apiRequest<UserDataExportResponse>("/api/account/export");
}

export function submitDeleteDataRequest() {
  return apiRequest<DeleteDataRequestResponse>("/api/account/delete-request", {
    method: "POST",
  });
}
