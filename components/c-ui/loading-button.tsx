import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"

import type { VariantProps } from "class-variance-authority"

type LoadingButtonProps = React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean
		isLoading?: boolean
	}

const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
	({ isLoading, disabled, children, ...props }, ref) => {
		return (
			<Button
				ref={ref}
				disabled={disabled || isLoading}
				{...props}
			>
				{isLoading && (
					<Loader2Icon className="animate-spin" />
				)}
				{children}
			</Button>
		)
	}
)

LoadingButton.displayName = "LoadingButton"

export { LoadingButton }
