export function PortalLogoutButton({ saId }: { saId: string }) {
  return (
    <form action={`/api/portal/${saId}/logout`} method="POST">
      <button
        type="submit"
        className="text-xs font-medium text-[#909090] hover:text-[#202124]"
      >
        Sign out
      </button>
    </form>
  );
}
