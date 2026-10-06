# PreferenceScale

Scala a cinque punti per dire quanto conta un interesse: nessun punto pieno vale 0.

- Un gruppo di radio (`role="radiogroup"`): cliccare il punto 3 riempie 1-3. Cliccare di nuovo il punto pieno più alto lo azzera.
- Il valore scritto corrisponde a `preference_weights.explicit`.
- Nelle preferenze si mostra un interesse per riga; nell'onboarding solo gli interessi scelti con i chip.
- Punti da 36px con 8px di spazio (44px di area toccabile), pieni in `lava`: il `coccio` resta per l'azione principale.
- Accanto all'etichetta il valore a parole: 0 Non conta, 1 Poco, 2 Un po', 3 Abbastanza, 4 Molto, 5 Moltissimo. È anche nel nome di ogni punto e descrive il gruppo (`aria-describedby`): `aria-valuetext` non è previsto su un `radiogroup`.
- Sotto i 480px etichetta e valore stanno sopra, i cinque punti sotto a tutta larghezza; a 360px niente scorrimento orizzontale.
