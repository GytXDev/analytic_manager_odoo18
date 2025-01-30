# analytic_manager\models\analytic_dashboard.py
from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from datetime import timedelta

class AnalyticDashboard(models.Model):
    _name = 'analytic.dashboard'
    _description = 'Tableau Analytique (Projet Unique)'

    name = fields.Many2one(
        'account.analytic.account',
        string="Code Projet",
        required=True,
        help="Sélectionnez le compte analytique associé au projet.",
        domain=[('code', '!=', False)]  
    )

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
    od_facture = fields.Float("OD Facture")
    non_facture = fields.Float("Non Facturé")
    trop_facture = fields.Float("Trop Facturé")
    depenses_cumulees = fields.Float(string="Dépenses Cumulées", compute='_compute_depenses_cumulees', store=False)
    debours_previsionnels = fields.Float("Débours Prévisionnels")

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
    pourcentage_avancement = fields.Float(
        string="Avancement (%)", 
        compute='_compute_pourcentage_avancement', 
        store=False
    )
    resultat_chantier_cumule = fields.Float(
        string="Résultat Chantier Cumulé (FCFA)", 
        compute='_compute_resultat_chantier_cumule', 
        store=False
    )

     # Ajout des champs d'écart temporel
    ecart_activite = fields.Float(
        string="Écart Activité (FCFA)", 
        compute='_compute_ecart_activite', 
        store=False
    )

    ecart_depenses = fields.Float(
        string="Écart Dépenses (FCFA)", 
        compute='_compute_ecart_depenses', 
        store=False
    )
 
    # Récupère la réference et plan analytique asssocié au compte analytique / code projet
    @api.onchange('name')
    def _onchange_name(self):
        """
        Met à jour automatiquement les champs 'libelle' et 'plan_id' 
        en fonction du compte analytique sélectionné.
        """
        for record in self:
            if record.name:
                record.libelle = record.name.code
                record.plan_id = record.name.plan_id
            else:
                record.libelle = False
                record.plan_id = False


    @api.depends('marche_initial', 'ts')
    def _compute_ca_final(self):
        for record in self:
            record.ca_final = round((record.marche_initial or 0) + (record.ts or 0), 2)

    # Calcule le total des factures fournisseurs
    @api.depends('name')
    def _compute_factures_cumulees(self):
        """
        Calcule le total hors taxes des factures fournisseurs associées au compte analytique sélectionné.
        """
        for record in self:
            if record.name:
                # Recherche des factures fournisseurs liées à ce compte analytique
                factures = self.env['account.move'].read_group(
                    domain=[
                        ('line_ids.analytic_distribution', 'in', [record.name.id]),  # Lignes analytiques liées
                        ('move_type', '=', 'in_invoice'),  # Factures fournisseurs
                        ('state', '=', 'posted')  # Factures validées
                    ],
                    fields=['amount_untaxed_in_currency_signed:sum'],
                    groupby=[]
                )

                # Récupération de la somme des montants hors taxes
                record.factures_cumulees = factures[0]['amount_untaxed_in_currency_signed'] if factures else 0.0
            else:
                record.factures_cumulees = 0.0

     # Calcule les dépenses cumulées
    @api.depends('factures_cumulees', 'od_facture')
    def _compute_depenses_cumulees(self):
        """
        Dépenses cumulées = Factures Cumulées (fournisseurs) + OD Facture.
        """
        for record in self:
            record.depenses_cumulees = round(record.factures_cumulees + (record.od_facture or 0), 2)

    # Calcule l'activité cumulées
    @api.depends('name')
    def _compute_activite_cumulee(self):
        """
        Calcule le total hors taxes (`amount_untaxed_in_currency_signed`) des factures clients
        associées au compte analytique sélectionné.
        """
        for record in self:
            if record.name:
                # Trouver toutes les factures clients liées au compte analytique
                move_ids = self.env['account.move.line'].search([
                    ('analytic_distribution', 'in', [record.name.id]),
                    ('move_id.move_type', '=', 'out_invoice'),
                    ('move_id.state', '=', 'posted')
                ]).mapped('move_id')

                # Calcul du montant hors taxe cumulé
                record.activite_cumulee = sum(move.amount_untaxed_in_currency_signed for move in move_ids)
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
                record.pourcentage_avancement = round((record.activite_cumulee or 0) / record.ca_final, 2)
            else:
                record.pourcentage_avancement = 0