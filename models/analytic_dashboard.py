# analytic_manager\models\analytic_dashboard.py
from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from datetime import timedelta

class AnalyticDashboard(models.Model):
    _name = 'analytic.dashboard'
    _description = 'Tableau Analytique (Projet Unique)'

    exploitation = fields.Selection([
        ('libreville', 'Libreville'),
        ('moanda', 'Moanda'),
        ('port_gentil', 'Port-Gentil'),
    ], string="Exploitation")


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
        Calcule le total des factures fournisseurs associées au compte analytique sélectionné.
        """
        for record in self:
            if record.name:
                # Recherche des lignes analytiques pour les factures fournisseurs
                supplier_invoices = self.env['account.move.line'].search([
                    ('analytic_distribution', '=', record.name.id),  # Distribution analytique liée
                    ('move_id.move_type', '=', 'in_invoice'),  # Factures fournisseurs
                    ('move_id.state', '=', 'posted'),  # Factures validées
                ])

                # Total des montants des factures fournisseurs
                record.factures_cumulees = sum(line.move_id.amount_total for line in supplier_invoices)
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


    @api.depends('name')
    def _compute_activite_cumulee(self):
        for record in self:
            if record.name:
                # Recherche des factures clients associées
                client_invoices = self.env['account.move.line'].search([
                    ('analytic_distribution', '=', record.name.id),
                    ('move_id.move_type', '=', 'out_invoice'),
                    ('move_id.state', '=', 'posted'),
                ])
                # Calcul de l'activité cumulée
                record.activite_cumulee = sum(line.move_id.amount_total for line in client_invoices)
            else:
                record.activite_cumulee = 0.0



    @api.depends('activite_cumulee', 'ca_final')
    def _compute_pourcentage_avancement(self):
        for record in self:
            if record.ca_final:
                record.pourcentage_avancement = round((record.activite_cumulee or 0) / record.ca_final, 2)
            else:
                record.pourcentage_avancement = 0


    @api.depends('activite_cumulee', 'depenses_cumulees')
    def _compute_resultat_chantier_cumule(self):
        for record in self:
            # Vérifie si l'une des valeurs est nulle
            if record.activite_cumulee is None or record.depenses_cumulees is None:
                record.resultat_chantier_cumule = 0.0  # Ou une autre valeur par défaut si nécessaire
            else:
                # Calcule le résultat chantier cumulé uniquement si les deux valeurs sont non nulles
                record.resultat_chantier_cumule = round(record.activite_cumulee - record.depenses_cumulees, 2)


     # Calcule l'écart d'activité par rapport au mois précédent
    @api.depends('name', 'activite_cumulee')
    def _compute_ecart_activite(self):
        for record in self:
            previous_month_date = fields.Date.today() - timedelta(days=30)
            previous_period = self.env['analytic.dashboard'].search([
                ('name', '=', record.name.id),
                ('date', '=', previous_month_date),
            ], limit=1)
            if previous_period:
                record.ecart_activite = round(record.activite_cumulee - previous_period.activite_cumulee, 2)
            else:
                record.ecart_activite = 0.0

    # Calcule l'écart de dépenses par rapport au mois précédent
    @api.depends('name', 'depenses_cumulees')
    def _compute_ecart_depenses(self):
        for record in self:
            previous_month_date = fields.Date.today() - timedelta(days=30)
            previous_period = self.env['analytic.dashboard'].search([
                ('name', '=', record.name.id),
                ('date', '=', previous_month_date),
            ], limit=1)
            if previous_period:
                record.ecart_depenses = round(record.depenses_cumulees - previous_period.depenses_cumulees, 2)
            else:
                record.ecart_depenses = 0.0

    
    # Ajout des méthodes supplémentaires pour l'analyse des projets
    def get_all_projets(self):
        """
        Retourne tous les projets, qu'ils soient en cours ou terminés.
        """
        projets = self.search([]) 
        projets_data = [{
            'code_projet': projet.name.code,
            'libelle': projet.libelle,
            'pourcentage_avancement': projet.pourcentage_avancement,
            'resultat_chantier': projet.resultat_chantier_cumule,
        } for projet in projets]
        return projets_data

    def get_resultat_chantier_total(self):
        """
        Calcule et retourne le résultat chantier total de tous les projets
        """
        total_resultat_chantier = sum(projet.resultat_chantier_cumule for projet in self.search([]))
        return {'resultat_chantier_total': total_resultat_chantier}

    def get_progression_moyenne(self):
        """
        Calcule la progression moyenne des projets
        """
        projets = self.search([])
        if projets:
            moyenne_progression = sum(projet.pourcentage_avancement for projet in projets) / len(projets)
        else:
            moyenne_progression = 0
        return {'progression_moyenne': moyenne_progression}
    
    def get_statistiques_projets(self):
        """
        Retourne des statistiques générales sur les projets sans distinction entre projets en cours et terminés.
        """
        projets = self.get_all_projets()  
        total_projets = len(projets) 
        return {
            'total_projets': total_projets,
            'resultat_chantier_total': self.get_resultat_chantier_total().get('resultat_chantier_total', 0),
            'progression_moyenne': self.get_progression_moyenne().get('progression_moyenne', 0),
        }
    
    def get_donnees_projets_independantes(self):
        """
        Retourne une liste des données indépendantes pour chaque projet.
        Chaque projet est représenté par un dictionnaire avec ses informations clés.
        """
        projets = self.get_all_projets() 
        projets_donnees = [] 

        for projet in projets:
            projet_donnees = {
                'code_projet': projet['code_projet'],
                'libelle': projet['libelle'],
                'pourcentage_avancement': projet['pourcentage_avancement'],
                'resultat_chantier': projet['resultat_chantier'],
                     
            }
            projets_donnees.append(projet_donnees)  
        
        return projets_donnees 