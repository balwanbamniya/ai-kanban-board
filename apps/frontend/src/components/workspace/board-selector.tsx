import { useBoards } from "../../lib/workspace";
import { ErrorNotice } from "../ui";
export function BoardSelector({
	value,
	onChange,
	all = false,
	activeOnly = false,
}: {
	value: string;
	onChange: (value: string) => void;
	all?: boolean;
	activeOnly?: boolean;
}) {
	const boards = useBoards();
	return (
		<>
			{boards.error && <ErrorNotice error={boards.error} />}
			<select
				aria-label="Board"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value="">{all ? "All boards" : "Choose a board"}</option>
				{boards.data
					?.filter((b) => !activeOnly || !b.archivedAt)
					.map((b) => (
						<option key={b.id} value={b.id}>
							{b.title}
							{b.archivedAt ? " (archived)" : ""}
						</option>
					))}
			</select>
		</>
	);
}
