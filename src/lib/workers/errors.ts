function isDevelopmentEnv(): boolean {
  return process.env.NODE_ENV === "development";
}

function formatNotNullError(message: string): string {
  const columnMatch = message.match(/column "([^"]+)"/i);
  if (columnMatch) {
    const column = columnMatch[1];
    if (column === "worker_code") {
      return "Worker code could not be generated.";
    }
    if (column === "experience_years") {
      return "Experience years is required.";
    }
    return `Registration failed: required field "${column}" is missing.`;
  }
  return `Registration failed: ${message}`;
}

function formatForeignKeyError(message: string): string {
  if (message.toLowerCase().includes("service")) {
    return "One or more selected services could not be linked. Check the service catalog.";
  }
  return "A related record could not be found. Please refresh and try again.";
}

/** Map raw database / API errors to user-friendly messages. */
export function mapWorkerError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("duplicate mobile") || lower.includes("mobile number already")) {
    return "Mobile number already exists.";
  }

  if (
    lower.includes("already exists") ||
    lower.includes("duplicate") ||
    lower.includes("unique") ||
    lower.includes("23505")
  ) {
    if (lower.includes("mobile") || lower.includes("worker_code")) {
      return lower.includes("worker_code")
        ? "Worker code could not be generated uniquely. Please try again."
        : "Mobile number already exists.";
    }
    return "This record already exists.";
  }

  if (lower.includes("unknown services") || lower.includes("was not found")) {
    return message.startsWith("Service")
      ? message
      : message.replace(/^Unknown services/, "Service");
  }

  if (lower.includes("service linking failed")) {
    return message.replace(/^Service linking failed:\s*/i, "Service linking failed: ");
  }

  if (lower.includes("document was uploaded but could not be linked")) {
    return message;
  }

  if (lower.includes("last_login_at")) {
    return "Registration could not be completed. Please try again.";
  }

  if (lower.includes("please select") || lower.includes("please enter")) {
    return message;
  }

  if (lower.includes("upload")) {
    return message;
  }

  if (
    lower.includes("null value in column") ||
    lower.includes("violates not-null constraint") ||
    lower.includes("23502")
  ) {
    return formatNotNullError(message);
  }

  if (lower.includes("foreign key") || lower.includes("23503")) {
    return formatForeignKeyError(message);
  }

  if (
    lower.includes("violates") ||
    lower.includes("postgres") ||
    lower.includes("pgrst") ||
    lower.includes("constraint")
  ) {
    if (isDevelopmentEnv()) {
      return message.length > 200 ? `${message.slice(0, 200)}…` : message;
    }
    return "Something went wrong. Please check your entries and try again.";
  }

  if (lower.includes("network") || lower.includes("fetch failed")) {
    return "Could not reach the database. Check your Supabase URL and network connection.";
  }

  return message.length > 120
    ? "Something went wrong. Please try again."
    : message;
}
