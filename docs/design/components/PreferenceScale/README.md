# PreferenceScale

Scala a cinque punti per dire quanto conta un interesse: nessun punto pieno vale 0.

- Un gruppo di radio (`role="radiogroup"`): cliccare il punto 3 riempie 1-3. Cliccare di nuovo il punto pieno più alto lo azzera.
- Il valore scritto corrisponde a `preference_weights.explicit`.
- Nelle preferenze si mostra un interesse per riga; nell'onboarding solo gli interessi scelti con i chip.
- Punti da 36px con 8px di spazio (44px di area toccabile), pieni in `lava`: il `coccio` resta per l'azione principale.
