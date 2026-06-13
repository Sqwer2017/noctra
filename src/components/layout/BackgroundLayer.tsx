import bgMain from "../../assets/bg-main.png";

export function BackgroundLayer() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <img
        src={bgMain}
        alt=""
        className="h-full w-full object-cover opacity-70"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.35),transparent_35%),linear-gradient(90deg,rgba(5,4,10,0.94),rgba(5,4,10,0.62),rgba(5,4,10,0.9))]" />

      <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-purple-700/20 blur-3xl" />
      <div className="absolute bottom-0 right-10 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:80px_80px] opacity-20" />
    </div>
  );
}