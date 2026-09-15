import bgMain from "../../assets/bg-main.png";

export function Background() {
  return (
    <div className="absolute inset-0">
      <img
        src={bgMain}
        alt=""
        className="h-full w-full object-cover opacity-75"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.25),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.18),transparent_30%),linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.46),rgba(0,0,0,0.9))]" />

      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:80px_80px] opacity-20" />

      <div className="absolute -left-32 top-20 h-96 w-96 rounded-full bg-purple-700/20 blur-3xl" />
      <div className="absolute bottom-0 right-20 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
    </div>
  );
}