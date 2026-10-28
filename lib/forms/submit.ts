import { startTransition, type FormEvent } from "react";

// React empties a form after its `action` runs, even when the action comes
// back with an error. Submitting through onSubmit instead keeps everything
// the person typed (CLAUDE.md: forms keep what was typed after an error,
// except passwords, which each form clears itself).
export function submitKeepingValues(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
}
