# analytic_manager\models\analytic_dashboard.py
from odoo import models, fields, api, _
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


    # Ajout des méthodes supplémentaires pour l'analyse des projets
    def get_all_projets(self):
        """
        Retourne tous les projets, qu'ils soient en cours ou terminés.
        """
        projets = self.search([])
        projets_data = []
        
        for projet in projets:
            projets_data.append({
                'id_code_project': projet.name.id,
                'code_projet': projet.name.name,
                'libelle': projet.libelle,
                'pourcentage_avancement': projet.pourcentage_avancement,
                'resultat_chantier_cumule': projet.resultat_chantier_cumule,
                'ca_final': projet.ca_final,
                'date': projet.date,
                'plan_id': projet.plan_id.id, 
                'factures_cumulees': projet.factures_cumulees,
                'depenses_cumulees': projet.depenses_cumulees,  
                'activite_cumulee': projet.activite_cumulee,  
            })
        
        return projets_data


    def get_donnees_projets_independantes(self):
        """
        Retourne une liste des données indépendantes pour chaque projet.
        Chaque projet est représenté par un dictionnaire avec ses informations clés.
        """
        projets = self.get_all_projets() 
        projets_donnees = [] 

        for projet in projets:
            projet_donnees = {
                'id_code_project': projet['id_code_project'],
                'code_projet': projet['code_projet'],
                'libelle': projet['libelle'],
                'pourcentage_avancement': projet['pourcentage_avancement'],
                'resultat_chantier_cumule': projet['resultat_chantier_cumule'],
                'ca_final': projet['ca_final'],
                'date': projet['date'],
                'plan_id': projet[ 'plan_id'],
                'factures_cumulees': projet['factures_cumulees'], 
                'depenses_cumulees': projet['depenses_cumulees'],
                'activite_cumulee' : projet['activite_cumulee'],
            }
            projets_donnees.append(projet_donnees)  
        
        return projets_donnees