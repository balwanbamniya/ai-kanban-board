import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../ui";
export function Modal({
	title,
	description,
	children,
	onClose,
	wide = false,
}: {
	title: string;
	description?: string;
	children: ReactNode;
	onClose: () => void;
	wide?: boolean;
}) {
	const [opener] = useState(() =>
		typeof document === "undefined" ? null : document.activeElement,
	);
	return (
		<Dialog.Root
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay className="modal-overlay" />
				<Dialog.Content
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						if (opener instanceof HTMLElement && opener.isConnected)
							opener.focus();
					}}
					className={`modal-content ${wide ? "drawer-content" : ""}`}
				>
					<div className="panel-heading">
						<div>
							<Dialog.Title>{title}</Dialog.Title>
							<Dialog.Description>
								{description || "Make a little room for progress."}
							</Dialog.Description>
						</div>
						<Dialog.Close asChild>
							<Button
								className="icon-button button-secondary"
								aria-label="Close"
							>
								<X size={20} />
							</Button>
						</Dialog.Close>
					</div>
					{children}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
export function ActionMenu({
	items,
}: {
	items: { label: string; action: () => void; disabled?: boolean }[];
}) {
	return (
		<Menu.Root>
			<Menu.Trigger asChild>
				<Button className="icon-button button-secondary" aria-label="Actions">
					<MoreHorizontal size={18} />
				</Button>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Content className="dropdown-content" sideOffset={5}>
					{items.map((item) => (
						<Menu.Item
							className="dropdown-item"
							disabled={item.disabled}
							key={item.label}
							onSelect={item.action}
						>
							{item.label}
						</Menu.Item>
					))}
				</Menu.Content>
			</Menu.Portal>
		</Menu.Root>
	);
}
export function More({
	query,
}: {
	query: {
		hasNextPage: boolean;
		isFetchingNextPage: boolean;
		fetchNextPage: () => unknown;
	};
}) {
	return query.hasNextPage ? (
		<Button
			className="button-secondary button-small"
			type="button"
			disabled={query.isFetchingNextPage}
			onClick={() => void query.fetchNextPage()}
		>
			{query.isFetchingNextPage ? "Loading…" : "Load more"}
		</Button>
	) : null;
}
