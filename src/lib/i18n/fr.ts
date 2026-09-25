import { APP_NAME } from '../config/app'

/**
 * French UI strings (04-UI §3). Every visible text goes through `t('key')`.
 * Typography: `t()` turns the space before « : ; ! ? % » into a no-break space.
 */
export const fr = {
  app: {
    name: APP_NAME,
    tagline: 'Des cartes, une file, chaque jour.',
    skipToContent: 'Aller au contenu',
    updateAvailable: 'Nouvelle version disponible',
    reload: 'Recharger',
    offlineReady: 'Prêt à fonctionner hors ligne',
  },
  nav: {
    label: 'Navigation principale',
    home: 'Accueil',
    cards: 'Cartes',
    add: 'Ajouter',
    import: 'Importer',
    stats: 'Statistiques',
    settings: 'Paramètres',
  },
  home: {
    title: 'Accueil',
    reviewToday: 'Réviser aujourd’hui',
    due: '{n} à revoir',
    newCards: '{n} nouvelles',
    nothingDue: 'Rien à revoir. Ajoutez des cartes ou revenez demain.',
    backupReminder: 'Dernière sauvegarde il y a {days} jours',
    backupNow: 'Sauvegarder maintenant',
  },
  review: {
    title: 'Révision',
    showAnswer: 'Afficher la réponse',
    again: 'Encore',
    hard: 'Difficile',
    good: 'Bien',
    easy: 'Facile',
    forgot: 'Oublié',
    ok: 'Réussi',
    sure: 'Sûr',
    undo: 'Annuler',
    edit: 'Modifier',
    suspend: 'Suspendre',
    retire: 'Retirer',
    retireLocked: 'Disponible après 3 réussites espacées',
    flag: 'Drapeau',
    info: 'Infos',
    typedPlaceholder: 'Votre réponse…',
    sessionDone: 'Séance terminée',
    sleepTip:
      'Une nuit de sommeil avant la prochaine révision consolide ce que vous venez d’apprendre.',
  },
  deck: {
    title: 'Paquet',
  },
  browser: {
    title: 'Cartes',
  },
  editor: {
    titleNew: 'Nouvelle note',
    titleEdit: 'Modifier la note',
    deck: 'Paquet',
    type: 'Type',
    basic: 'Basique',
    basicReverse: 'Basique + inverse',
    cloze: 'Texte à trous',
    front: 'Recto',
    back: 'Verso',
    extra: 'Extra',
    text: 'Texte',
    tags: 'Tags',
    source: 'Source',
    add: 'Ajouter',
    addClose: 'Ajouter et fermer',
    tooLong: 'Plus de 200 caractères : une carte, une information.',
    looksLikeList: 'On dirait une liste : découpez-la ou utilisez un texte à trous.',
    duplicate: 'Une carte avec le même recto existe déjà dans ce paquet.',
  },
  scheduler: {
    fsrs: 'FSRS (recommandé)',
    leitner: 'Memory Box (7 compartiments)',
    retention: 'Rétention cible',
    retentionHelp:
      '90 % : vous oublierez une carte sur dix à chaque révision. Au-dessus de 95 %, la charge explose.',
    leitnerInterval: 'Intervalles par carte (recommandé)',
    leitnerCalendar: 'Calendrier du coffret (fidèle, charge irrégulière)',
    alternateSides: 'Alterner recto/verso à chaque réussite',
    box: 'Compartiment {n}',
    boxTarget: '→ C{n} · {when}',
  },
  states: {
    new: 'Nouvelle',
    learning: 'Apprentissage',
    review: 'Révision',
    relearning: 'Réapprentissage',
    suspended: 'Suspendue',
    retired: 'Retirée',
  },
  import: {
    title: 'Importer',
    csv: 'Fichier CSV ou TSV',
    apkg: 'Paquet Anki (.apkg)',
    backup: 'Sauvegarde Recto',
    anki21b:
      'Ce fichier utilise le nouveau format Anki (compressé). Dans Anki, exportez avec l’option « Prise en charge des anciennes versions d’Anki » puis réessayez.',
  },
  stats: {
    title: 'Statistiques',
  },
  settings: {
    title: 'Paramètres',
  },
  storage: {
    persistAsk: 'Autoriser Recto à conserver vos cartes même si l’espace est faible',
    quotaWarning:
      'Stockage presque plein ({pct} %). Exportez une sauvegarde et supprimez des médias.',
  },
  notFound: {
    title: 'Page introuvable',
    back: 'Retour à l’accueil',
  },
  common: {
    cancel: 'Annuler',
    confirm: 'Confirmer',
    delete: 'Supprimer',
    save: 'Enregistrer',
    close: 'Fermer',
    search: 'Rechercher',
    today: 'Aujourd’hui',
    tomorrow: 'Demain',
    inDays: 'dans {n} j',
    minutes: '{n} min',
    comingSoon: 'Cet écran sera disponible dans un prochain jalon.',
  },
} as const
