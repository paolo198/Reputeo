# Validation Google — Reputeo

Ce document prépare la demande Google. Il ne remplace pas les actions à faire dans Google Cloud Console par le propriétaire du projet.

## Deux validations distinctes

1. **Validation OAuth** : enlève l’écran « application non validée » pour les utilisateurs de Reputeo.
2. **Accès aux API Google Business Profile** : donne réellement accès aux comptes, établissements et avis. Cette autorisation est distincte de l’OAuth ; sans elle, une connexion Google peut réussir mais les avis restent inaccessibles ou soumis à un quota nul.

## Éléments déjà prêts dans Reputeo

- Domaine de production : `https://reputeo.app`
- Page d’accueil : `https://reputeo.app`
- Politique de confidentialité : `https://reputeo.app/privacy`
- Conditions : `https://reputeo.app/terms`
- Connexion OAuth par redirection serveur : `https://reputeo.app/api/google?action=callback`
- Logo Reputeo et nom de produit cohérents dans l’application.

## À faire dans Google Cloud Console

- Vérifier la propriété de `reputeo.app` dans Google Search Console avec un compte propriétaire ou éditeur du projet.
- Dans **Google Auth Platform → Branding**, renseigner exactement le nom **Reputeo**, le logo, la page d’accueil, la politique de confidentialité, les conditions et l’e-mail de support réellement relevé.
- Dans **Audience**, publier l’application en production quand tout est prêt.
- Dans **Data Access**, ne conserver que les scopes effectivement nécessaires et expliquer chaque usage.
- Enregistrer une vidéo de démonstration en anglais montrant : la page Reputeo, le clic de connexion, l’écran de consentement complet, puis la fonctionnalité utilisant le scope.
- Soumettre la validation OAuth.

## Demande Google Business Profile API

- Faire la demande d’accès Google Business Profile séparément avec le même projet Google Cloud.
- Préparer une fiche Google Business Profile vérifiée et active depuis au moins 60 jours : Google la demande aux candidats à l’API.
- Utiliser le site Reputeo et expliquer le cas d’usage : importer les avis d’un établissement autorisé et permettre au propriétaire de préparer/publier ses réponses.
- Après accord, activer les API Business Profile nécessaires dans la bibliothèque du projet.

## Point à ne pas ignorer

Le scope Agenda ne doit être soumis que lorsqu’une fonction visible utilise réellement les données d’Agenda. Google exige le scope le plus limité et refuse les scopes ajoutés pour de futures fonctionnalités.

## Sources officielles

- https://support.google.com/cloud/answer/13461325
- https://support.google.com/cloud/answer/13464321
- https://developers.google.com/my-business/content/prereqs
- https://developers.google.com/my-business/content/basic-setup
