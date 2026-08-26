const DASHBOARD_PROFILE_PHOTO_STORAGE_KEY_PREFIX = "cincel.dashboard.profile.photo.v1";

export function getDashboardProfilePhotoStorageKey(memberId: number | null): string | null {
  if (memberId === null) {
    return null;
  }

  return `${DASHBOARD_PROFILE_PHOTO_STORAGE_KEY_PREFIX}.${memberId}`;
}

export function loadDashboardProfilePhoto(memberId: number | null): string {
  if (typeof window === "undefined") {
    return "";
  }

  const storageKey = getDashboardProfilePhotoStorageKey(memberId);
  if (!storageKey) {
    return "";
  }

  return localStorage.getItem(storageKey) ?? "";
}

export function saveDashboardProfilePhoto(memberId: number | null, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getDashboardProfilePhotoStorageKey(memberId);
  if (!storageKey) {
    return;
  }

  localStorage.setItem(storageKey, value);
}

export function clearDashboardProfilePhoto(memberId: number | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getDashboardProfilePhotoStorageKey(memberId);
  if (!storageKey) {
    return;
  }

  localStorage.removeItem(storageKey);
}