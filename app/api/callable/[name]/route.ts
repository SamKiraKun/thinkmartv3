import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const CALLABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,127}$/;
const DEFAULT_FUNCTIONS_REGION = "us-central1";
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const REGION_PATTERN = /^[a-z]+[a-z0-9-]*$/;

function toSafeHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function pickProjectId(request: NextRequest): string | null {
  const envProjectId = toSafeHeaderValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null);
  if (envProjectId && PROJECT_ID_PATTERN.test(envProjectId)) {
    return envProjectId;
  }

  const headerProjectId = toSafeHeaderValue(request.headers.get("x-firebase-project-id"));
  if (headerProjectId && PROJECT_ID_PATTERN.test(headerProjectId)) {
    return headerProjectId;
  }

  return null;
}

function pickRegion(request: NextRequest): string {
  const envRegion = toSafeHeaderValue(process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || null);
  if (envRegion && REGION_PATTERN.test(envRegion)) {
    return envRegion;
  }

  const headerRegion = toSafeHeaderValue(request.headers.get("x-firebase-functions-region"));
  if (headerRegion && REGION_PATTERN.test(headerRegion)) {
    return headerRegion;
  }

  return DEFAULT_FUNCTIONS_REGION;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const functionName = params.name;
  if (!CALLABLE_NAME_PATTERN.test(functionName)) {
    return NextResponse.json(
      {
        error: {
          status: "INVALID_ARGUMENT",
          message: "Invalid callable function name",
        },
      },
      { status: 400 }
    );
  }

  const projectId = pickProjectId(request);
  const region = pickRegion(request);

  if (!projectId) {
    return NextResponse.json(
      {
        error: {
          status: "FAILED_PRECONDITION",
          message: "Firebase project ID is not configured for callable proxy",
        },
      },
      { status: 500 }
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const payload =
    body && typeof body === "object" && "data" in (body as Record<string, unknown>)
      ? (body as Record<string, unknown>)
      : { data: body ?? {} };

  const upstreamHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    upstreamHeaders.Authorization = authHeader;
  }

  const appCheckHeader = request.headers.get("x-firebase-appcheck");
  if (appCheckHeader) {
    upstreamHeaders["X-Firebase-AppCheck"] = appCheckHeader;
  }

  const instanceIdHeader = request.headers.get("firebase-instance-id-token");
  if (instanceIdHeader) {
    upstreamHeaders["Firebase-Instance-ID-Token"] = instanceIdHeader;
  }

  const url = `https://${region}-${projectId}.cloudfunctions.net/${functionName}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const responseText = await response.text();
    const contentType = response.headers.get("content-type") || "application/json";

    return new NextResponse(responseText, {
      status: response.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          status: "UNAVAILABLE",
          message: error instanceof Error ? error.message : "Callable proxy request failed",
        },
      },
      { status: 503 }
    );
  }
}
