export const getErrorMessage = (error: unknown, defaultMessage: string = "An error occurred"): string => {
    if (typeof error === "string") {
        return error
    }

    if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message
        if (typeof message === "string" && message.length > 0) {
            return message
        }
    }

    return defaultMessage
}