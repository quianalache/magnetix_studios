// Required for the `@modal` parallel route slot: renders nothing when no
// intercepted route is active (i.e. every URL except a post opened via
// client-side navigation from within this community).
export default function Default() {
  return null;
}
