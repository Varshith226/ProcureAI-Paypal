"use strict";

class AIServiceError extends Error {
  constructor(code, message, statusCode = 502, details = []) {
    super(message);
    this.name = "AIServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = { AIServiceError };
