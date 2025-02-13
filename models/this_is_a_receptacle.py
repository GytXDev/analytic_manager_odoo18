# analytic_manager\models\analytic_dashboard.py
from odoo import models, fields, api, _
from odoo.http import content_disposition, request
from odoo.exceptions import ValidationError
from datetime import timedelta

class AnalyticDashboard(models.Model):
    _name = 'analytic.dashboard'
    _description = 'Tableau Analytique'

    name = fields.Many2one(
        'account.analytic.account',
        string="Code Projet",
        required=True,
        help="Sélectionnez le compte analytique associé au projet.",
        domain=[('code', '!=', False)]  
    )

    _sql_constraints = [
        ('unique_analytic_account', 'unique(name)', 'Un tableau analytique existe déjà pour ce projet !')
    ]

    libelle = fields.Char(
        string="Libellé",
    )

    date = fields.Date(
        'Date',
        required=True,
        index=True,
        default=fields.Date.context_today,
    )

    plan_id = fields.Many2one(
        comodel_name='account.analytic.plan',
        string="Plan Analytique",
    )

    marche_initial = fields.Float("Marché Initial")
    ts = fields.Float("Travaux Supplémentaires")
    factures_cumulees = fields.Float("Factures Cumulées", compute='_compute_factures_cumulees')
    non_facture = fields.Float("Non Facturé")
    trop_facture = fields.Float("Trop Facturé")
    depenses_cumulees = fields.Float(string="Dépenses Cumulées", compute='_compute_depenses_cumulees', store=False)
    debours_previsionnels = fields.Float("Débours Prévisionnels")
    debours_comptable_cumule = fields.Float("Débours comptable Cumulé")
    total_debourses = fields.Float("Total Déboursés")
  
    # Champs supplémentaires à renseigner 
    od_facture = fields.Float("Opérations Diverses Facturées")
    oda_d = fields.Float("Ordres Divers d'Achats Décaissés")
    ffnp = fields.Float("Factures Fournisseurs Non Parvenues")
    stocks = fields.Float("Stocks")
    provisions = fields.Float("Provisions")
    
    ca_final = fields.Float(
        string="CA Final (FCFA)", 
        compute='_compute_ca_final', 
        store=False
    )
    activite_cumulee = fields.Float(
        string="Activité Cumulée (FCFA)", 
        compute='_compute_activite_cumulee', 
        store=False
    )

    # Champ pour le pourcentage d'avancement (décimal)
    pourcentage_avancement = fields.Float(
        string="Avancement (%)",
        compute='_compute_pourcentage_avancement',
        store=True 
    )

    resultat_chantier_cumule = fields.Float(
        string="Résultat Chantier Cumulé (FCFA)", 
        compute='_compute_resultat_chantier_cumule', 
        store=False
    )

    plan = fields.Float(
        string="Plan",
        help="Objectif financier à atteindre sur une exploitation."
    )

    @api.model
    def create(self, vals):
        if 'name' in vals:
            existing_dashboard = self.search([('name', '=', vals['name'])])
            if existing_dashboard:
                raise ValidationError(_('Une analyse analytique existe déjà pour ce projet !'))
        return super(AnalyticDashboard, self).create(vals)


    @api.depends('marche_initial', 'ts')
    def _compute_ca_final(self):
        for record in self:
            record.ca_final = round((record.marche_initial or 0) + (record.ts or 0), 2)

    # Calcule le total des factures fournisseurs
    @api.depends('name')
    def _compute_factures_cumulees(self):
        """
        Calcule le total hors taxes des factures fournisseurs,
        en soustrayant les montants des avoirs (factures d'avoir).
        """
        for record in self:
            if record.name:
                # Recherche des factures fournisseurs et des avoirs liés au compte analytique
                factures = self.env['account.move.line'].search([
                    ('analytic_distribution', 'in', [record.name.id]),
                    ('move_id.move_type', 'in', ['in_invoice', 'in_refund']),
                    ('move_id.state', '=', 'posted')
                ])

                # Élimination des doublons en regroupant par facture
                move_ids = factures.mapped('move_id')

                # Calcul des totaux pour les factures et les avoirs
                total_factures = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'in_invoice')
                total_avoirs = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'in_refund')

                # Calcul final : Factures - Avoirs
                record.factures_cumulees = total_factures + total_avoirs
            else:
                record.factures_cumulees = 0.0

                
    # Calcule les dépenses cumulées
    @api.depends('factures_cumulees', 'oda_d', 'ffnp', 'stocks', 'provisions')
    def _compute_depenses_cumulees(self):
        """
        Dépenses cumulées = Factures Cumulées (fournisseurs) + ODA D. + Factures Fournisseurs Non Parvenues 
        + Stocks + Provisions
        """
        for record in self:
            record.depenses_cumulees = round(
                (record.factures_cumulees or 0) + 
                (record.oda_d or 0) + 
                (record.ffnp or 0) + 
                (record.stocks or 0) + 
                (record.provisions or 0), 2
            )

    # Calcule l'activité cumulée
    @api.depends('name', 'od_facture', 'non_facture', 'trop_facture')
    def _compute_activite_cumulee(self):
        """
        Calcule le total hors taxes des factures clients,
        en soustrayant les montants des factures d'avoir (out_refund).
        """
        for record in self:
            if record.name:
                # Recherche des factures et avoirs liés au compte analytique
                move_lines = self.env['account.move.line'].search([
                    ('analytic_distribution', 'in', [record.name.id]),
                    ('move_id.move_type', 'in', ['out_invoice', 'out_refund']),
                    ('move_id.state', '=', 'posted')
                ])

                # Éliminer les doublons de factures
                move_ids = move_lines.mapped('move_id')

                # Calcul des factures et des avoirs
                total_factures = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'out_invoice')
                total_avoirs = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'out_refund')

                # Calcul final : Factures - Avoirs + ajustements
                record.activite_cumulee = (total_factures + total_avoirs) + \
                                        (record.od_facture or 0) + \
                                        (record.non_facture or 0) + \
                                        (record.trop_facture or 0)
            else:
                record.activite_cumulee = 0.0



    @api.depends('activite_cumulee', 'depenses_cumulees')
    def _compute_resultat_chantier_cumule(self):
        for record in self:
            # Vérifie si l'une des valeurs est nulle
            if record.activite_cumulee is None or record.depenses_cumulees is None:
                record.resultat_chantier_cumule = 0.0  # Ou une autre valeur par défaut si nécessaire
            else:
                # Calcule le résultat chantier cumulé uniquement si les deux valeurs sont non nulles
                record.resultat_chantier_cumule = round(record.activite_cumulee + record.depenses_cumulees, 2)


    @api.depends('activite_cumulee', 'ca_final')
    def _compute_pourcentage_avancement(self):
        for record in self:
            if record.ca_final:
                # Calcul du pourcentage avec 2 décimales
                record.pourcentage_avancement = round((record.activite_cumulee or 0) / record.ca_final, 2)
            else:
                record.pourcentage_avancement = 0.0


    @api.depends('marche_initial', 'ts', 'factures_cumulees', 'oda_d', 'debours_previsionnels')
    def _compute_trop_facture(self):
        """
        Calcule la différence entre les dépenses prévisionnelles renseignées (debours_previsionnels) 
        et les dépenses facturées (factures_cumulees + oda_d).
        Si la différence est positive, elle est enregistrée dans 'trop_facture'.
        Avec conditions inspirées de la formule Excel pour éviter des calculs dans certains cas.
        """
        for record in self:
            # Si L17 + M17 == 0, ou si E17 == 0, ou si A17 est vide, ne rien faire
            if (record.l or 0) + (record.m or 0) == 0 or record.e == 0 or not record.a:
                record.trop_facture = 0.0
                continue
            
            # Utilisation de debours_previsionnels comme renseigné par l'utilisateur
            debours_previsionnels = record.debours_previsionnels or 0

            # Calcul des dépenses facturées (factures_cumulees + oda_d)
            total_debours_reels = (record.factures_cumulees or 0) + (record.oda_d or 0)

            # Calcul du trop facturé (dépenses prévisionnelles - dépenses facturées)
            if debours_previsionnels > total_debours_reels:
                record.trop_facture = round(debours_previsionnels - total_debours_reels, 2)
            else:
                record.trop_facture = 0.0

