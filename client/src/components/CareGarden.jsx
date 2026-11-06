const STAGES = ['🌱', '🌿', '🪴', '🌷', '🌻'];

export default function CareGarden({ totalMl, goalMl, streak }) {
  const fraction = Math.max(0, Math.min(1, totalMl / goalMl));
  const stage = Math.min(STAGES.length - 1, Math.floor(fraction * STAGES.length));
  return (
    <section className="card garden-card">
      <div className="garden-copy">
        <span className="eyebrow">LITTLE GARDEN</span>
        <h2>{fraction >= 1 ? 'ပန်းလေး ပွင့်သွားပြီ' : 'ရေသောက်တိုင်း ကြီးလာမယ်'}</h2>
        <p className="muted small">
          {streak >= 7 ? `🏅 ${streak} ရက် streak badge ရထားပြီ` : `၇ ရက်ဆက်တိုက်အတွက် ${Math.max(0, 7 - streak)} ရက်လိုသေးတယ်`}
        </p>
      </div>
      <div className={`plant stage-${stage}`} aria-label={`ပန်းပင် ${Math.round(fraction * 100)} ရာခိုင်နှုန်း`}>
        <span>{STAGES[stage]}</span>
        <i className="plant-glow" />
      </div>
      <div className="garden-progress"><span style={{ width: `${fraction * 100}%` }} /></div>
    </section>
  );
}
